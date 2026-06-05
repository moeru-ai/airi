import { describe, expect, it } from 'vitest'

import { createGpuExecutor, GPU_PRIORITY } from './gpu-executor'

describe('gpuExecutor', () => {
  it('should run work sequentially (only one at a time across loads and inference)', async () => {
    const executor = createGpuExecutor()
    const running: string[] = []
    const completed: string[] = []

    const makeWork = (id: string, delay: number) => async () => {
      running.push(id)
      // Concurrency 1: at most one unit in flight at any instant.
      expect(running.length - completed.length).toBeLessThanOrEqual(1)
      await new Promise(r => setTimeout(r, delay))
      completed.push(id)
      return id
    }

    const p1 = executor.run('model-a', 1, makeWork('model-a', 30))
    const p2 = executor.run('model-b', 1, makeWork('model-b', 10))

    const [r1, r2] = await Promise.all([p1, p2])

    expect(r1).toBe('model-a')
    expect(r2).toBe('model-b')
    expect(completed).toEqual(['model-a', 'model-b'])
  })

  it('should run higher-priority work first', async () => {
    const executor = createGpuExecutor()
    const order: string[] = []

    // Hold the slot with a slow unit so the rest queue behind it.
    const hold = executor.run('hold', 0, async () => {
      await new Promise(r => setTimeout(r, 50))
      order.push('hold')
    })

    const low = executor.run('low', GPU_PRIORITY.BG_REMOVAL_PROCESS, async () => {
      order.push('low')
    })

    const high = executor.run('high', GPU_PRIORITY.TTS_GENERATE, async () => {
      order.push('high')
    })

    const mid = executor.run('mid', GPU_PRIORITY.STT_TRANSCRIBE, async () => {
      order.push('mid')
    })

    await Promise.all([hold, low, high, mid])

    // After the holder releases, the queue drains highest-priority first.
    expect(order[0]).toBe('hold')
    expect(order[1]).toBe('high')
    expect(order[2]).toBe('mid')
    expect(order[3]).toBe('low')
  })

  it('should keep a load and an inference mutually exclusive', async () => {
    const executor = createGpuExecutor()
    const events: string[] = []

    // A "load" holds the slot; an "inference" queued behind it must not start
    // until the load finishes — the core guarantee that prevents a load and an
    // inference kernel from overlapping.
    const load = executor.run('whisper-load', GPU_PRIORITY.STT_LOAD, async () => {
      events.push('load:start')
      await new Promise(r => setTimeout(r, 20))
      events.push('load:end')
    })
    const inference = executor.run('tts-generate', GPU_PRIORITY.TTS_GENERATE, async () => {
      events.push('infer:start')
    })

    await Promise.all([load, inference])

    expect(events).toEqual(['load:start', 'load:end', 'infer:start'])
  })

  it('should propagate work errors to the caller and recover for the next unit', async () => {
    const executor = createGpuExecutor()

    await expect(
      executor.run('bad', 1, async () => {
        throw new Error('inference failed')
      }),
    ).rejects.toThrow('inference failed')

    // The slot must release on error so subsequent work still runs.
    const result = await executor.run('good', 1, async () => 'ok')
    expect(result).toBe('ok')
  })

  it('should report active and pending correctly', async () => {
    const executor = createGpuExecutor()

    expect(executor.active).toBeNull()
    expect(executor.pending).toEqual([])

    let resolve!: () => void
    const blocker = new Promise<void>(r => resolve = r)

    const p = executor.run('running', 1, () => blocker)
    await new Promise(r => setTimeout(r, 5))
    expect(executor.active).toBe('running')

    resolve()
    await p
    expect(executor.active).toBeNull()
  })

  describe('cancellation', () => {
    it('should reject immediately if the signal is already aborted', async () => {
      const executor = createGpuExecutor()
      const controller = new AbortController()
      controller.abort()

      let workCalled = false
      const promise = executor.run(
        'already-aborted',
        1,
        async () => {
          workCalled = true
          return 'x'
        },
        { signal: controller.signal },
      )

      await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
      expect(workCalled).toBe(false)
    })

    it('should remove a pending entry and release nothing when its signal aborts', async () => {
      const executor = createGpuExecutor()

      let releaseHold!: () => void
      const hold = executor.run('hold', 10, () => new Promise<void>(r => releaseHold = r))

      const controller = new AbortController()
      let workCalled = false
      const pending = executor.run(
        'pending',
        1,
        async () => {
          workCalled = true
        },
        { signal: controller.signal },
      )

      expect(executor.pending).toContain('pending')

      controller.abort(new Error('cancelled by test'))
      await expect(pending).rejects.toThrow('cancelled by test')
      expect(executor.pending).not.toContain('pending')
      expect(workCalled).toBe(false)

      releaseHold()
      await hold
    })

    it('should not interrupt active work — that is the work callback\'s responsibility', async () => {
      const executor = createGpuExecutor()
      const controller = new AbortController()

      const activePromise = executor.run(
        'active',
        1,
        async () => {
          await new Promise((resolve, reject) => {
            controller.signal.addEventListener('abort', () => {
              reject(new Error('work aborted'))
            })
          })
        },
        { signal: controller.signal },
      )

      await new Promise(r => setTimeout(r, 5))
      expect(executor.active).toBe('active')

      controller.abort()
      await expect(activePromise).rejects.toThrow('work aborted')
    })

    it('should recover after a cancelled entry and continue processing the queue', async () => {
      const executor = createGpuExecutor()

      let releaseHold!: () => void
      const hold = executor.run('hold', 10, () => new Promise<void>(r => releaseHold = r))

      const controller = new AbortController()
      const cancelled = executor.run(
        'cancelled',
        5,
        async () => 'should-not-run',
        { signal: controller.signal },
      )

      const later = executor.run('later', 5, async () => 'later-result')

      controller.abort()
      await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' })

      releaseHold()
      await hold

      expect(await later).toBe('later-result')
    })
  })

  describe('preemption', () => {
    it('should let a higher-priority unit preempt a long streaming unit at a yield point', async () => {
      const executor = createGpuExecutor()
      const order: string[] = []

      // Low-priority stream: records a chunk, then yields, three times.
      const low = executor.run('low', GPU_PRIORITY.STT_TRANSCRIBE, async (slot) => {
        for (const i of [1, 2, 3]) {
          order.push(`low${i}`)
          await slot.yield()
        }
      })

      // Enqueued synchronously after `low` started and parked on its first
      // (no-op) yield. It must preempt before `low` finishes.
      const high = executor.run('high', GPU_PRIORITY.TTS_GENERATE, async () => {
        order.push('high')
      })

      await Promise.all([low, high])

      // `high` jumps in at the first yield AFTER it was enqueued, before low3.
      expect(order).toEqual(['low1', 'low2', 'high', 'low3'])
      expect(order.indexOf('high')).toBeLessThan(order.indexOf('low3'))
    })

    it('should bound starvation of a lower-priority unit under a continuous higher-priority stream', async () => {
      // Large aging step so the lower-priority STT preempts quickly and the test
      // stays deterministic without depending on the production default.
      const executor = createGpuExecutor({ agingStep: 10 })
      const order: string[] = []

      const tts = executor.run('tts', GPU_PRIORITY.TTS_GENERATE, async (slot) => {
        for (const i of [1, 2, 3, 4, 5, 6]) {
          order.push(`tts${i}`)
          await slot.yield()
        }
      })

      const stt = executor.run('stt', GPU_PRIORITY.STT_TRANSCRIBE, async () => {
        order.push('stt')
      })

      await Promise.all([tts, stt])

      // STT (base 80) preempts TTS (base 100) once aging closes the gap of 20.
      // The first yield is a no-op (STT not yet queued); STT then ages on each
      // subsequent yield and reaches effective 110 > 100 at the yield after
      // tts4, landing right after it — well before TTS exhausts its six chunks.
      expect(order.indexOf('stt')).toBeLessThan(order.indexOf('tts6'))
      expect(order.indexOf('stt')).toBe(order.indexOf('tts4') + 1)
    })

    it('should unwind and release the slot when a parked unit is aborted mid-stream', async () => {
      const executor = createGpuExecutor()
      const order: string[] = []
      const controller = new AbortController()

      const low = executor.run('low', GPU_PRIORITY.STT_TRANSCRIBE, async (slot) => {
        order.push('low1')
        await slot.yield() // no-op (nothing waiting yet)
        order.push('low2')
        await slot.yield() // parks here once `high` is waiting
        order.push('low3') // must NOT run — aborted while parked
      }, { signal: controller.signal }).catch((error: unknown) => error)

      const high = executor.run('high', GPU_PRIORITY.TTS_GENERATE, async () => {
        // Abort the parked low unit while we hold the slot.
        controller.abort('cancelled while parked')
        order.push('high')
      })

      const [lowResult] = await Promise.all([low, high])

      expect((lowResult as Error).name).toBe('AbortError')
      expect(order).toEqual(['low1', 'low2', 'high'])

      // The slot is free and the executor still schedules subsequent work.
      expect(executor.active).toBeNull()
      expect(executor.pending).toEqual([])
      expect(await executor.run('after', 1, async () => 'ok')).toBe('ok')
    })
  })
})
