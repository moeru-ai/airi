import type { BatchScheduler } from './batcher'

import { describe, expect, it, vi } from 'vitest'

import { createBatcher } from './batcher'

function createManualScheduler() {
  const timers: { callback: () => void, delayMs: number, cancelled: boolean }[] = []
  const schedule: BatchScheduler = (callback, delayMs) => {
    const timer = { callback, delayMs, cancelled: false }
    timers.push(timer)
    return () => {
      timer.cancelled = true
    }
  }
  const fire = () => {
    for (const timer of timers.splice(0)) {
      if (!timer.cancelled)
        timer.callback()
    }
  }
  return { schedule, timers, fire }
}

describe('createBatcher', () => {
  it('flushes the pending items when the wait of the first item ends', () => {
    const scheduler = createManualScheduler()
    const flush = vi.fn()
    const batcher = createBatcher<number>({ maxWaitMs: 50, flush, schedule: scheduler.schedule })

    batcher.push(1)
    batcher.push(2)

    expect(scheduler.timers).toHaveLength(1)
    expect(scheduler.timers[0]?.delayMs).toBe(50)
    expect(flush).not.toHaveBeenCalled()
    scheduler.fire()
    expect(flush).toHaveBeenCalledExactlyOnceWith([1, 2])
  })

  it('flushes at once when the batch reaches maxItems, and cancels the timer', () => {
    const scheduler = createManualScheduler()
    const flush = vi.fn()
    const batcher = createBatcher<number>({ maxWaitMs: 50, maxItems: 2, flush, schedule: scheduler.schedule })

    batcher.push(1)
    batcher.push(2)
    batcher.push(3)

    expect(flush).toHaveBeenCalledExactlyOnceWith([1, 2])
    expect(scheduler.timers[0]?.cancelled).toBe(true)
    expect(scheduler.timers).toHaveLength(2)
  })

  it('flushes on push when the deadline passed but the timer did not run', () => {
    const scheduler = createManualScheduler()
    const flush = vi.fn()
    let now = 0
    const batcher = createBatcher<string>({ maxWaitMs: 50, flush, now: () => now, schedule: scheduler.schedule })

    batcher.push('a')
    now = 80
    batcher.push('b')

    expect(flush).toHaveBeenCalledExactlyOnceWith(['a'])
    scheduler.fire()
    expect(flush).toHaveBeenLastCalledWith(['b'])
  })

  it('starts a new batch for an item that the flush callback pushes', () => {
    const scheduler = createManualScheduler()
    const batches: number[][] = []
    const batcher = createBatcher<number>({
      maxWaitMs: 50,
      schedule: scheduler.schedule,
      flush: (items) => {
        batches.push(items)
        if (items[0] === 1)
          batcher.push(2)
      },
    })

    batcher.push(1)
    batcher.flush()
    scheduler.fire()

    expect(batches).toEqual([[1], [2]])
  })

  it('flushes on close and ignores later pushes', () => {
    const flush = vi.fn()
    const batcher = createBatcher<number>({ maxWaitMs: 50, flush, schedule: createManualScheduler().schedule })

    batcher.push(1)
    batcher.close()
    batcher.push(2)
    batcher.flush()

    expect(flush).toHaveBeenCalledExactlyOnceWith([1])
  })

  it('uses setTimeout by default', async () => {
    vi.useFakeTimers()
    try {
      const flush = vi.fn()
      const batcher = createBatcher<number>({ maxWaitMs: 50, flush })
      batcher.push(1)
      await vi.advanceTimersByTimeAsync(49)
      expect(flush).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1)
      expect(flush).toHaveBeenCalledExactlyOnceWith([1])
    }
    finally {
      vi.useRealTimers()
    }
  })
})
