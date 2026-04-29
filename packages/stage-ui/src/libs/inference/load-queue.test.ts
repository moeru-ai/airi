import { describe, expect, it } from 'vitest'

import { createLoadQueue, LOAD_PRIORITY } from './load-queue'

describe('loadQueue', () => {
  it('should process items sequentially (only one at a time)', async () => {
    const queue = createLoadQueue()
    const running: string[] = []
    const completed: string[] = []

    const makeLoader = (id: string, delay: number) => async () => {
      running.push(id)
      // Only one should be running at a time
      expect(running.length - completed.length).toBeLessThanOrEqual(1)
      await new Promise(r => setTimeout(r, delay))
      completed.push(id)
      return id
    }

    const p1 = queue.enqueue('model-a', 1, makeLoader('model-a', 30))
    const p2 = queue.enqueue('model-b', 1, makeLoader('model-b', 10))

    const [r1, r2] = await Promise.all([p1, p2])

    expect(r1).toBe('model-a')
    expect(r2).toBe('model-b')
    expect(completed).toEqual(['model-a', 'model-b'])
  })

  it('should process higher priority items first', async () => {
    const queue = createLoadQueue()
    const order: string[] = []

    // Hold the queue with a slow loader
    const hold = queue.enqueue('hold', 0, async () => {
      await new Promise(r => setTimeout(r, 50))
      order.push('hold')
    })

    // Queue items with different priorities (while hold is running)
    const low = queue.enqueue('low', LOAD_PRIORITY.BACKGROUND_REMOVAL, async () => {
      order.push('low')
    })

    const high = queue.enqueue('high', LOAD_PRIORITY.TTS, async () => {
      order.push('high')
    })

    const mid = queue.enqueue('mid', LOAD_PRIORITY.ASR, async () => {
      order.push('mid')
    })

    await Promise.all([hold, low, high, mid])

    // After hold, highest priority should go first
    expect(order[0]).toBe('hold')
    expect(order[1]).toBe('high')
    expect(order[2]).toBe('mid')
    expect(order[3]).toBe('low')
  })

  it('should propagate loader errors to caller', async () => {
    const queue = createLoadQueue()

    await expect(
      queue.enqueue('bad', 1, async () => {
        throw new Error('load failed')
      }),
    ).rejects.toThrow('load failed')

    // Queue should recover for next item
    const result = await queue.enqueue('good', 1, async () => 'ok')
    expect(result).toBe('ok')
  })

  it('should report active and pending correctly', async () => {
    const queue = createLoadQueue()

    expect(queue.active).toBeNull()
    expect(queue.pending).toEqual([])

    let resolve!: () => void
    const blocker = new Promise<void>(r => resolve = r)

    const p = queue.enqueue('loading', 1, () => blocker)
    // After enqueue, the loader should be active
    await new Promise(r => setTimeout(r, 5))
    expect(queue.active).toBe('loading')

    resolve()
    await p
    expect(queue.active).toBeNull()
  })

  describe('cancellation', () => {
    it('should reject immediately if signal is already aborted', async () => {
      const queue = createLoadQueue()
      const controller = new AbortController()
      controller.abort()

      let loaderCalled = false
      const promise = queue.enqueue(
        'already-aborted',
        1,
        async () => {
          loaderCalled = true
          return 'x'
        },
        { signal: controller.signal },
      )

      await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
      expect(loaderCalled).toBe(false)
    })

    it('should remove a pending entry from the queue when its signal aborts', async () => {
      const queue = createLoadQueue()

      // Hold the queue with a slow loader
      let releaseHold!: () => void
      const hold = queue.enqueue('hold', 10, () => new Promise<void>(r => releaseHold = r))

      const controller = new AbortController()
      let loaderCalled = false
      const pending = queue.enqueue(
        'pending',
        1,
        async () => {
          loaderCalled = true
        },
        { signal: controller.signal },
      )

      expect(queue.pending).toContain('pending')

      controller.abort(new Error('cancelled by test'))
      await expect(pending).rejects.toThrow('cancelled by test')
      expect(queue.pending).not.toContain('pending')
      expect(loaderCalled).toBe(false)

      releaseHold()
      await hold
    })

    it('should not interrupt an active loader — that is the loader\'s responsibility', async () => {
      const queue = createLoadQueue()
      const controller = new AbortController()

      // Loader that honors its own signal
      const activePromise = queue.enqueue(
        'active',
        1,
        async () => {
          await new Promise((resolve, reject) => {
            controller.signal.addEventListener('abort', () => {
              reject(new Error('loader aborted'))
            })
          })
        },
        { signal: controller.signal },
      )

      // Give the loader a tick to start
      await new Promise(r => setTimeout(r, 5))
      expect(queue.active).toBe('active')

      controller.abort()
      await expect(activePromise).rejects.toThrow('loader aborted')
    })

    it('should recover after a cancelled entry and continue processing subsequent items', async () => {
      const queue = createLoadQueue()

      // Hold the queue
      let releaseHold!: () => void
      const hold = queue.enqueue('hold', 10, () => new Promise<void>(r => releaseHold = r))

      const controller = new AbortController()
      const cancelled = queue.enqueue(
        'cancelled',
        5,
        async () => 'should-not-run',
        { signal: controller.signal },
      )

      const later = queue.enqueue('later', 5, async () => 'later-result')

      controller.abort()
      await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' })

      releaseHold()
      await hold

      expect(await later).toBe('later-result')
    })
  })
})
