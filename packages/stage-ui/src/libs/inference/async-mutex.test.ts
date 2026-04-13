import { describe, expect, it } from 'vitest'

import { AsyncMutex } from './async-mutex'

describe('asyncMutex', () => {
  it('should serialize concurrent operations', async () => {
    const mutex = new AsyncMutex()
    const order: number[] = []

    const p1 = mutex.run(async () => {
      await new Promise(r => setTimeout(r, 50))
      order.push(1)
      return 'a'
    })

    const p2 = mutex.run(async () => {
      order.push(2)
      return 'b'
    })

    const [r1, r2] = await Promise.all([p1, p2])

    expect(r1).toBe('a')
    expect(r2).toBe('b')
    expect(order).toEqual([1, 2])
  })

  it('should handle errors without blocking subsequent operations', async () => {
    const mutex = new AsyncMutex()

    await expect(mutex.run(async () => {
      throw new Error('fail')
    })).rejects.toThrow('fail')

    // Should still work after error
    const result = await mutex.run(async () => 'ok')
    expect(result).toBe('ok')
  })

  it('should reset and reject waiting operations', async () => {
    const mutex = new AsyncMutex()

    // Queue a waiting operation that will never resolve on its own
    let resolveHold!: () => void
    const holdPromise = new Promise<void>(r => resolveHold = r)

    const hold = mutex.run(() => holdPromise).catch(() => 'hold-rejected')
    const waiting = mutex.run(async () => 'waited').catch(() => 'waiting-rejected')

    // Reset — should reject waiting operations
    await new Promise(r => setTimeout(r, 10))
    mutex.reset(new Error('reset'))
    resolveHold()

    const [holdResult, waitingResult] = await Promise.all([hold, waiting])

    // Waiting should be rejected
    expect(waitingResult).toBe('waiting-rejected')
    // Hold may or may not be rejected (it was active)
    expect(['hold-rejected', undefined]).toContain(holdResult)
  })

  it('should support synchronous callbacks', async () => {
    const mutex = new AsyncMutex()
    const result = await mutex.run(() => 42)
    expect(result).toBe(42)
  })
})
