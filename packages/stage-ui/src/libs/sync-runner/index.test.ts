import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SyncRunner } from './index'

describe('syncRunner', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('merges requests during a run into one more run', async () => {
    const releases: Array<() => void> = []
    const run = vi.fn(() => new Promise<void>((resolve) => {
      releases.push(resolve)
    }))
    const runner = new SyncRunner(run)

    const first = runner.request()
    const second = runner.request()
    const third = runner.request()
    releases[0]()
    await vi.advanceTimersByTimeAsync(0)
    releases[1]()
    await Promise.all([first, second, third])

    expect(run).toHaveBeenCalledTimes(2)
  })

  it('reports a failed run, does not reject, and retries until a run succeeds', async () => {
    const run = vi.fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('first'))
      .mockRejectedValueOnce(new Error('second'))
      .mockResolvedValue(undefined)
    const onError = vi.fn()
    const runner = new SyncRunner(run, { onError, retryDelaysMs: [10, 100] })

    await expect(runner.request()).resolves.toBeUndefined()
    expect(onError).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(10)
    expect(run).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(99)
    expect(run).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(run).toHaveBeenCalledTimes(3)

    await vi.advanceTimersByTimeAsync(1000)
    expect(run).toHaveBeenCalledTimes(3)
  })

  it('replaces a pending retry when a new request succeeds', async () => {
    const run = vi.fn<() => Promise<void>>().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
    const runner = new SyncRunner(run, { retryDelaysMs: [10] })

    await runner.request()
    await runner.request()
    await vi.advanceTimersByTimeAsync(100)

    expect(run).toHaveBeenCalledTimes(2)
  })

  it('starts nothing after dispose', async () => {
    const run = vi.fn<() => Promise<void>>().mockRejectedValue(new Error('offline'))
    const runner = new SyncRunner(run, { retryDelaysMs: [10] })

    await runner.request()
    runner.dispose()
    await runner.request()
    await vi.advanceTimersByTimeAsync(100)

    expect(run).toHaveBeenCalledTimes(1)
  })
})
