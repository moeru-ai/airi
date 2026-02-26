import { describe, expect, it } from 'vitest'

import { createRemoteStreamCounter } from './remote-stream-counter'

describe('createRemoteStreamCounter', () => {
  it('is not processing initially', () => {
    const counter = createRemoteStreamCounter()
    expect(counter.isProcessing()).toBe(false)
  })

  it('is processing after enter, not after leave', () => {
    const counter = createRemoteStreamCounter()
    counter.enter()
    expect(counter.isProcessing()).toBe(true)
    counter.leave()
    expect(counter.isProcessing()).toBe(false)
  })

  it('stays processing until all concurrent handlers have left', async () => {
    const counter = createRemoteStreamCounter()
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

    // Simulate two remote stream handlers that overlap: both enter, then resolve in reverse order.
    const promise1 = (async () => {
      counter.enter()
      await delay(30)
      counter.leave()
    })()
    const promise2 = (async () => {
      counter.enter()
      await delay(10)
      counter.leave()
    })()

    // During overlap (before 10ms), count is 2.
    await delay(5)
    expect(counter.isProcessing()).toBe(true)

    // After first handler leaves (at 10ms), count is 1 - still processing.
    await promise2
    expect(counter.isProcessing()).toBe(true)

    // After second handler leaves (at 30ms), count is 0.
    await promise1
    expect(counter.isProcessing()).toBe(false)
  })
})
