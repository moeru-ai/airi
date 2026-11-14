import process from 'node:process'

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import * as v from 'valibot'

// These synthetic identities describe an ABA fault. No native handle reuse is forced.
const approved = {
  hwnd: '1234',
  pid: 100,
  thread: 101,
  className: 'TestWindow',
  processStarted: 'instance-a',
  windowGeneration: 1,
  child: '2345',
  childGeneration: 1,
  frame: { x: 0, y: 0, width: 400, height: 200 },
  button: { x: 20, y: 30, width: 100, height: 40 },
}
const stockArgv = ['invoke', 'input.clickPoint', '70', '50', '--target', 'window:1234', '--relative-to', 'window', '--input-policy', 'background-only', '--click-count', '1']

describe('phase 3-A target identity counterexamples, simulation only', () => {
  it.each([
    { ...approved, pid: 200, processStarted: 'instance-b' },
    { ...approved, windowGeneration: 2 },
    { ...approved, childGeneration: 2 },
    { ...approved, child: '3456', button: { x: 220, y: 30, width: 100, height: 40 } },
    { ...approved, frame: { x: 10, y: 10, width: 400, height: 200 } },
  ])('has the same stock target string after an unapproved identity or geometry change: %j', (replacement) => {
    expect(replacement).not.toEqual(approved)
    expect(`window:${replacement.hwnd}`).toBe(stockArgv[stockArgv.indexOf('--target') + 1])
    expect(stockArgv).not.toContain(String(replacement.pid))
    expect(stockArgv).not.toContain(replacement.processStarted)
  })

  it('cannot distinguish same-process HWND reuse by PID, thread and class alone', () => {
    const replacement = { ...approved, windowGeneration: 2 }
    expect(replacement.windowGeneration).not.toBe(approved.windowGeneration)
    expect([replacement.hwnd, replacement.pid, replacement.thread, replacement.className])
      .toEqual([approved.hwnd, approved.pid, approved.thread, approved.className])
  })
})

// This suite consumes real receipts. It does not start AUV or inject input.
describe.runIf(Boolean(process.env.AIRI_PHASE3_EVIDENCE))('phase 3-A independent native receipts', () => {
  it('retains two independent processes, a displaced button, a real replacement and zero input', async () => {
    const window = v.object({ live: v.boolean(), root: v.object({ hwnd: v.string(), pid: v.number() }) })
    const snapshot = v.object({ pid: v.number(), instance: v.string(), windows: v.array(window) })
    const receipt = v.parse(v.object({
      initialA: snapshot,
      initialB: snapshot,
      replaced: snapshot,
      closed: snapshot,
      stalePointPlanAcceptedWhileDecoyOccupiesPoint: v.boolean(),
      noInputMessagesOrBusinessMutations: v.boolean(),
      targetBStateUnchanged: v.boolean(),
      fixtureNeverForeground: v.boolean(),
      verdict: v.string(),
    }), JSON.parse(await readFile(join(process.env.AIRI_PHASE3_EVIDENCE!, 'oracle-verdict.json'), 'utf8')))
    expect(receipt.initialA.pid).not.toBe(receipt.initialB.pid)
    expect(receipt.initialA.instance).not.toBe(receipt.initialB.instance)
    expect(receipt.initialA.windows[0].root.pid).toBe(receipt.initialA.pid)
    expect(receipt.initialB.windows[0].root.pid).toBe(receipt.initialB.pid)
    expect(receipt.stalePointPlanAcceptedWhileDecoyOccupiesPoint).toBe(true)
    expect(receipt.replaced.windows.at(-1)?.root.hwnd).not.toBe('0')
    expect(receipt.replaced.windows.at(-1)?.live).toBe(true)
    expect(receipt.closed.windows.at(-1)?.live).toBe(false)
    expect(receipt.noInputMessagesOrBusinessMutations).toBe(true)
    expect(receipt.targetBStateUnchanged).toBe(true)
    expect(receipt.fixtureNeverForeground).toBe(true)
    expect(receipt.verdict).toBe('NO-GO')
  })
})
