import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestConfig } from '../test-fixtures'
import { createLocalShellRunner } from './runner'

const io = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock('node:child_process', () => ({ spawn: io.spawn }))

function fixture() {
  const child = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    pid: undefined,
    kill: vi.fn(() => true),
  })
  io.spawn.mockReturnValue(child)
  const runner = createLocalShellRunner(createTestConfig())
  const input = runner.prepare!({ command: 'controlled-command' })
  return { child, runner, input }
}

beforeEach(() => vi.clearAllMocks())

describe('direct Shell lifecycle', () => {
  it('ends ownership when spawn rejects synchronously before creating a native process', async () => {
    const { runner, input } = fixture()
    io.spawn.mockImplementationOnce(() => {
      throw new TypeError('Controlled NUL argument rejection before native spawn.')
    })
    const execution = runner.startPrepared!(input)
    let closed = false
    void execution.closed.then(() => {
      closed = true
    })
    await expect(execution.result).rejects.toThrow('Controlled NUL argument rejection')
    await Promise.resolve()
    console.info(JSON.stringify({ spawnApiCalls: io.spawn.mock.calls.length, nativeProcesses: 0, effects: 0, directLifecycleEnded: closed }))
    expect(closed).toBe(true)
  })

  it('does not dispatch a request cancelled before spawn', () => {
    const { runner, input } = fixture()
    const abort = new AbortController()
    abort.abort()
    expect(() => runner.startPrepared!(input, abort.signal)).toThrow()
    expect(io.spawn).not.toHaveBeenCalled()
  })

  it('stops after dispatch but settles only when the direct Shell actually closes', async () => {
    const { child, runner, input } = fixture()
    const abort = new AbortController()
    const execution = runner.startPrepared!(input, abort.signal)
    let closed = false
    let settled = false
    void execution.closed.then(() => {
      closed = true
    })
    void execution.result.then(() => {
      settled = true
    })
    child.stdout.write('effect already occurred')
    abort.abort()
    await Promise.resolve()
    expect(io.spawn).toHaveBeenCalledTimes(1)
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    expect({ closed, settled }).toEqual({ closed: false, settled: false })
    child.emit('close', 7)
    const result = await execution.result
    await execution.closed
    expect(result).toMatchObject({ exitCode: 7, timedOut: false, stdout: 'effect already occurred' })
    console.info(JSON.stringify({ dispatches: io.spawn.mock.calls.length, stopRequests: child.kill.mock.calls.length, result, directShellClosed: closed, descendantCleanup: 'Not Verified' }))
  })

  it('closes owned executions, rejects new dispatch and waits for actual close', async () => {
    const { child, runner, input } = fixture()
    const execution = runner.startPrepared!(input)
    let closed = false
    const closing = runner.close!().then(() => {
      closed = true
    })
    expect(() => runner.startPrepared!(input)).toThrow(/closed/)
    await Promise.resolve()
    expect(closed).toBe(false)
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    child.emit('close', 1)
    await closing
    await execution.result
    expect(io.spawn).toHaveBeenCalledTimes(1)
    await runner.close!()
  })

  it('keeps a timed-out execution owned until its actual close', async () => {
    vi.useFakeTimers()
    try {
      const { child, runner, input } = fixture()
      const execution = runner.startPrepared!({ ...input, timeoutMs: 100 })
      await vi.advanceTimersByTimeAsync(100)
      expect(await execution.result).toMatchObject({ exitCode: 124, timedOut: true })
      let closed = false
      const closing = runner.close!().then(() => {
        closed = true
      })
      await Promise.resolve()
      expect(closed).toBe(false)
      child.emit('close', 1)
      await closing
      expect(await execution.result).toMatchObject({ exitCode: 124, timedOut: true })
    }
    finally {
      vi.useRealTimers()
    }
  })
})
