import { describe, expect, it } from 'vitest'

import { createPendingTracker } from './pending-tracker'

describe('createPendingTracker', () => {
  /**
   * @example
   * Tracked promise resolves normally → forwarded value, set drains to 0.
   */
  it('passes through resolution of the underlying promise', async () => {
    const tracker = createPendingTracker()
    const tracked = tracker.track(Promise.resolve(42))
    expect(tracker.size()).toBe(1)
    expect(await tracked).toBe(42)
    // Microtask flush — settle removes from set
    await Promise.resolve()
    expect(tracker.size()).toBe(0)
  })

  /**
   * @example
   * Tracked promise rejects normally → forwarded error, set drains to 0.
   */
  it('passes through rejection of the underlying promise', async () => {
    const tracker = createPendingTracker()
    const original = new Error('original')
    const tracked = tracker.track(Promise.reject(original))
    await expect(tracked).rejects.toBe(original)
    expect(tracker.size()).toBe(0)
  })

  /**
   * @example
   * The R-01 / JFR-001 P0 contract: in-flight RPC promise must reject when
   * the tracker is drained — a hung eventa invoke would otherwise leave the
   * caller waiting forever after socket disconnect.
   */
  it('rejects pending promises with the drainAll error before they settle', async () => {
    const tracker = createPendingTracker()
    let resolveOuter: (v: number) => void = () => {}
    const neverResolves = new Promise<number>((resolve) => {
      resolveOuter = resolve
    })
    const tracked = tracker.track(neverResolves)
    expect(tracker.size()).toBe(1)

    const cancelError = new Error('chat-ws: rpc cancelled')
    tracker.drainAll(cancelError)

    await expect(tracked).rejects.toBe(cancelError)
    expect(tracker.size()).toBe(0)

    // Even if the underlying promise settles later, the tracked promise
    // already settled with the drain error and must not change state.
    resolveOuter(99)
    await Promise.resolve()
    expect(tracker.size()).toBe(0)
  })

  /**
   * @example
   * drainAll over multiple in-flight tracks rejects every one of them with
   * the same error. The chat-ws disposeContext fires once and must clear
   * every queued sendMessages/pullMessages call simultaneously.
   */
  it('drainAll rejects every in-flight tracked promise', async () => {
    const tracker = createPendingTracker()
    const promises = [
      tracker.track(new Promise<number>(() => {})),
      tracker.track(new Promise<number>(() => {})),
      tracker.track(new Promise<number>(() => {})),
    ]
    expect(tracker.size()).toBe(3)

    const cancelError = new Error('drain')
    tracker.drainAll(cancelError)

    for (const p of promises) {
      await expect(p).rejects.toBe(cancelError)
    }
    expect(tracker.size()).toBe(0)
  })

  /**
   * @example
   * drainAll on an empty tracker is a no-op (no throw, no work).
   */
  it('drainAll is a safe no-op when nothing is pending', () => {
    const tracker = createPendingTracker()
    expect(() => tracker.drainAll(new Error('unused'))).not.toThrow()
    expect(tracker.size()).toBe(0)
  })

  /**
   * @example
   * Drain → fresh track works again — the tracker is reusable across
   * dispose/reconnect cycles.
   */
  it('is reusable after drainAll — new tracks succeed normally', async () => {
    const tracker = createPendingTracker()
    // Pin a `.catch` on the cycle-1 tracked promise so the drain rejection
    // is observed; otherwise vitest reports it as an unhandled rejection.
    const cycle1 = tracker.track(new Promise<number>(() => {}))
    cycle1.catch(() => {})
    tracker.drainAll(new Error('cycle 1 dispose'))
    expect(tracker.size()).toBe(0)

    const fresh = tracker.track(Promise.resolve('reconnected'))
    expect(tracker.size()).toBe(1)
    expect(await fresh).toBe('reconnected')
  })

  /**
   * @example
   * After drainAll, a tracked promise that subsequently rejects must not
   * cause an unhandled-rejection (we already settled with the drain error).
   * If the wrapper accidentally re-rejected we'd see "uncaught (in promise)"
   * spam from real eventa invokes that fail on disposed contexts.
   */
  it('does not re-reject a tracked promise after drainAll', async () => {
    const tracker = createPendingTracker()
    let rejectOuter: (e: Error) => void = () => {}
    const eventualReject = new Promise<number>((_, reject) => {
      rejectOuter = reject
    })
    const tracked = tracker.track(eventualReject)
    tracker.drainAll(new Error('drain'))
    await expect(tracked).rejects.toThrow('drain')

    // Now make the underlying promise reject. The tracked wrapper already
    // settled — this should NOT surface as an unhandled rejection.
    rejectOuter(new Error('late underlying'))
    // Attach a catch so the underlying promise's rejection is observed (and
    // the test doesn't fail on unhandled-rejection in strict environments).
    eventualReject.catch(() => {})
    await Promise.resolve()
    expect(tracker.size()).toBe(0)
  })
})
