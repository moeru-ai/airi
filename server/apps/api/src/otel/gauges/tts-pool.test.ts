import type { GatewayMetrics, ObservabilityMetrics } from '..'
import type { ConcurrencyLedger } from '../../services/domain/llm-router/concurrency-ledger'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { registerTtsPoolGauge } from './tts-pool'

/**
 * Capture the callback registered via `gauge.addCallback` plus a spyable
 * `observe` so tests can drive OTel collection cycles by hand.
 *
 * @example
 * const { gauge, observe, run } = makeGauge()
 * registerTtsPoolGauge(gauge, ledger, errs)
 * await run()
 * expect(observe).toHaveBeenCalledWith(3, { app_id: 'app-1' })
 */
function makeGauge() {
  let cb: ((result: { observe: (v: number, attrs: Record<string, string>) => void }) => Promise<void> | void) | null = null
  const observe = vi.fn()
  const gauge = {
    addCallback: vi.fn((fn: typeof cb) => { cb = fn }),
  } as unknown as GatewayMetrics['poolInflight']
  return {
    gauge,
    observe,
    run: async () => {
      if (!cb)
        throw new Error('no callback registered')
      await cb({ observe })
    },
  }
}

function makeLedger(snapshot: () => Promise<Array<{ inflight: number, poolId: string }>>): ConcurrencyLedger {
  return {
    currentInflight: vi.fn(),
    isSaturated: vi.fn(),
    markSaturated: vi.fn(),
    release: vi.fn(),
    snapshot: vi.fn(snapshot),
    tryAcquire: vi.fn(),
  } as unknown as ConcurrencyLedger
}

function makeReadErrors() {
  const add = vi.fn()
  return { add, metricReadErrors: { add } as unknown as ObservabilityMetrics['metricReadErrors'] }
}

describe('registerTtsPoolGauge', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('observes one point per pool with the app_id attribute', async () => {
    const ledger = makeLedger(async () => [
      { inflight: 3, poolId: 'app-1' },
      { inflight: 7, poolId: 'app-2' },
    ])
    const { metricReadErrors } = makeReadErrors()
    const { gauge, observe, run } = makeGauge()

    registerTtsPoolGauge(gauge, ledger, metricReadErrors)
    await run()

    expect(observe).toHaveBeenCalledTimes(2)
    expect(observe).toHaveBeenCalledWith(3, { app_id: 'app-1' })
    expect(observe).toHaveBeenCalledWith(7, { app_id: 'app-2' })
  })

  it('does not observe and records a read error when the snapshot fails', async () => {
    // Letting the gauge skip an export cycle lets Prometheus staleness expose the
    // outage instead of masking it with a stale value.
    const ledger = makeLedger(async () => {
      throw new Error('redis down')
    })
    const { add, metricReadErrors } = makeReadErrors()
    const { gauge, observe, run } = makeGauge()

    registerTtsPoolGauge(gauge, ledger, metricReadErrors)
    await run()

    expect(observe).not.toHaveBeenCalled()
    expect(add).toHaveBeenCalledWith(1, { metric: 'airi.gen_ai.gateway.pool.inflight' })
  })

  it('serves the cached snapshot within the 10s TTL without re-reading Redis', async () => {
    const ledger = makeLedger(async () => [{ inflight: 1, poolId: 'app-1' }])
    const { metricReadErrors } = makeReadErrors()
    const { gauge, observe, run } = makeGauge()

    registerTtsPoolGauge(gauge, ledger, metricReadErrors)
    await run()
    vi.advanceTimersByTime(5_000)
    await run()

    expect(ledger.snapshot).toHaveBeenCalledTimes(1)
    expect(observe).toHaveBeenCalledTimes(2)
  })

  it('re-reads Redis after the cache TTL expires', async () => {
    const ledger = makeLedger(async () => [{ inflight: 1, poolId: 'app-1' }])
    const { metricReadErrors } = makeReadErrors()
    const { gauge, run } = makeGauge()

    registerTtsPoolGauge(gauge, ledger, metricReadErrors)
    await run()
    vi.advanceTimersByTime(10_001)
    await run()

    expect(ledger.snapshot).toHaveBeenCalledTimes(2)
  })
})
