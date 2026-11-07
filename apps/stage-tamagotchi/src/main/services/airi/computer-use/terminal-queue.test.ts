import type { ExecFileOptions } from 'node:child_process'

import { ChildProcess } from 'node:child_process'
import { PassThrough } from 'node:stream'

import { errorMessageFrom } from '@moeru/std'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PendingActionManager } from './action-manager'
import { createComputerUseRuntime } from './runtime'

interface CliResult {
  stdout: string
  stderr: string
}

const external = vi.hoisted(() => ({
  execute: vi.fn<(file: string, args: readonly string[], options: ExecFileOptions) => Promise<CliResult> & { child: ChildProcess }>(),
  start: vi.fn(),
}))

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  const { promisify } = await import('node:util')
  return { ...actual, execFile: Object.assign(vi.fn(), { [promisify.custom]: external.execute }) }
})
vi.mock('@auv-js/sdk/node', () => ({ startAuv: external.start }))
vi.mock('electron', () => ({ app: { isPackaged: false, getPath: vi.fn() } }))

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0))
    await cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('shared Terminal and native desktop admission', () => {
  it.each(['queued', 'subsequent'] as const)('blocks a %s Terminal dispatch after the native child leaves an unconfirmed descendant', async (timing) => {
    vi.useFakeTimers()
    const actions = new PendingActionManager()
    const runtime = createComputerUseRuntime({ binaryPath: 'fixture-auv', storeRoot: '/fixture', actionManager: actions })
    cleanups.push(runtime.dispose)
    external.start.mockResolvedValue({ connectionOptions: { credential: 'fixture-token' }, endpoints: ['ipc://fixture-auv'], exited: new Promise(() => {}), stop: vi.fn() })
    const attribution = { sessionId: 'session-a', turnId: 'turn-a', toolCallId: 'call-a', senderWebContentsId: 71 }
    const argv = ['invoke', 'app.activate', 'fixture-app']
    const action = actions.createPendingAction({ argv, attribution })
    actions.approve(action.id)
    const child = new ChildProcess()
    child.stdin = new PassThrough()
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    let reply!: (value: CliResult) => void
    let entered!: () => void
    const started = new Promise<void>((resolve) => {
      entered = resolve
    })
    const result = new Promise<CliResult>((resolve) => {
      reply = resolve
    })
    external.execute.mockImplementationOnce(() => {
      entered()
      return Object.assign(result, { child })
    })
    const first = runtime.run({ argv, actionId: action.id, attribution }, 71)
    await started
    const oracle = { terminalDispatches: 0, terminalEffects: 0 }
    const operation = async () => {
      oracle.terminalDispatches++
      oracle.terminalEffects++
    }
    const queued = timing === 'queued' ? runtime.executeInSlot(operation).catch((error: unknown) => error) : undefined
    child.emit('exit', 0, null)
    reply({ stdout: '{"activated":true}', stderr: '' })
    await vi.advanceTimersByTimeAsync(1000)
    await first
    const rejected = queued ? await queued : await runtime.executeInSlot(operation).catch((error: unknown) => error)
    console.info(JSON.stringify({ boundary: 'Controlled native process and Terminal callback. No OS input.', timing, nativeCalls: external.execute.mock.calls.length, oracle, firstSettlement: actions.get(action.id)?.settlement, terminalError: errorMessageFrom(rejected) ?? null }))

    expect(external.execute).toHaveBeenCalledTimes(1)
    expect(oracle.terminalDispatches).toBe(0)
    expect(oracle.terminalEffects).toBe(0)
    expect(rejected).toMatchObject({ executionState: 'not_executed' })
    expect(actions.get(action.id)?.settlement).toMatchObject({ executionState: 'executed', exitCode: 0 })

    const observedChild = new ChildProcess()
    observedChild.stdin = new PassThrough()
    external.execute.mockImplementationOnce(() => {
      void Promise.resolve().then(() => observedChild.emit('close', 0, null))
      return Object.assign(Promise.resolve({ stdout: '[]', stderr: '' }), { child: observedChild })
    })
    const observed = await runtime.run({ argv: ['invoke', 'window.list'], attribution: { ...attribution, toolCallId: 'read-after-risk' } }, 71)
    expect(observed.executionState).toBe('executed')
    expect(external.execute).toHaveBeenCalledTimes(2)
  })
})
