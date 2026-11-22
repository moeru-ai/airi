import { describe, expect, it } from 'vitest'

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

describe('target delivery identity counterexamples, simulation only', () => {
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
