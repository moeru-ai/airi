import type { AuthMetrics, ObservabilityMetrics } from '..'
import type { Database } from '../../libs/db'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { registerRollingActiveUsersGauge } from './rolling-active-users'

/**
 * Capture the callback registered via `gauge.addCallback` and a spyable
 * `observe` so tests can drive collection cycles by hand.
 *
 * @example
 * const { gauge, observe, run } = makeGauge()
 * register...(gauge, db, errs)
 * await run()
 * expect(observe).toHaveBeenCalledWith(5, { window: '24h' })
 */
function makeGauge() {
  let cb: ((result: { observe: (v: number, attrs: Record<string, string>) => void }) => void | Promise<void>) | null = null
  const observe = vi.fn()
  const gauge = {
    addCallback: vi.fn((fn: typeof cb) => { cb = fn }),
  } as unknown as AuthMetrics['rollingActiveUsers']
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

/**
 * Drizzle's `db.select({...}).from(table)` is awaited directly (thenable
 * query builder). Mock it as `select -> { from: () => Promise<rows> }`.
 *
 * @example
 * const db = makeDb([{ dau: '5', wau: '10', mau: '20' }])
 */
function makeDb(rows: unknown[], opts: { reject?: boolean } = {}) {
  const from = vi.fn(() => (opts.reject ? Promise.reject(new Error('db down')) : Promise.resolve(rows)))
  const select = vi.fn(() => ({ from }))
  return { db: { select } as unknown as Database, select, from }
}

function makeReadErrors() {
  const add = vi.fn()
  return { metricReadErrors: { add } as unknown as ObservabilityMetrics['metricReadErrors'], add }
}

describe('registerRollingActiveUsersGauge', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('observes one point per window with the window attribute', async () => {
    // Postgres count(*) comes back as a numeric string — assert we coerce it.
    const { db } = makeDb([{ dau: '5', wau: '12', mau: '40' }])
    const { metricReadErrors } = makeReadErrors()
    const { gauge, observe, run } = makeGauge()

    registerRollingActiveUsersGauge(gauge, db, metricReadErrors)
    await run()

    expect(observe).toHaveBeenCalledTimes(3)
    expect(observe).toHaveBeenNthCalledWith(1, 5, { window: '24h' })
    expect(observe).toHaveBeenNthCalledWith(2, 12, { window: '7d' })
    expect(observe).toHaveBeenNthCalledWith(3, 40, { window: '30d' })
  })

  it('serves cached values without re-querying inside the 60s TTL', async () => {
    const { db, select } = makeDb([{ dau: '3', wau: '7', mau: '9' }])
    const { metricReadErrors } = makeReadErrors()
    const { gauge, observe, run } = makeGauge()

    registerRollingActiveUsersGauge(gauge, db, metricReadErrors)
    await run()
    await vi.advanceTimersByTimeAsync(30_000)
    await run()

    // Second collection within TTL hits cache: still one DB query, but six
    // observes (3 per cycle).
    expect(select).toHaveBeenCalledTimes(1)
    expect(observe).toHaveBeenCalledTimes(6)
  })

  it('re-queries after the TTL expires', async () => {
    const { db, select } = makeDb([{ dau: '1', wau: '1', mau: '1' }])
    const { metricReadErrors } = makeReadErrors()
    const { gauge, run } = makeGauge()

    registerRollingActiveUsersGauge(gauge, db, metricReadErrors)
    await run()
    await vi.advanceTimersByTimeAsync(61_000)
    await run()

    expect(select).toHaveBeenCalledTimes(2)
  })

  it('on DB error: increments read-errors and does not observe', async () => {
    // ROOT CAUSE:
    //
    // A silent gauge that observes a stale/zero value on DB failure masks the
    // outage forever — an absence-based alert can never fire.
    //
    // We fixed this by skipping result.observe(...) on error and bumping
    // airi.observability.read_errors{metric}, so Prometheus staleness exposes
    // the broken DB instead.
    const { db } = makeDb([], { reject: true })
    const { metricReadErrors, add } = makeReadErrors()
    const { gauge, observe, run } = makeGauge()

    registerRollingActiveUsersGauge(gauge, db, metricReadErrors)
    await run()

    expect(observe).not.toHaveBeenCalled()
    expect(add).toHaveBeenCalledWith(1, { metric: 'user.active_rolling' })
  })

  it('coalesces concurrent collection cycles into one DB query', async () => {
    const { db, select } = makeDb([{ dau: '2', wau: '4', mau: '6' }])
    const { metricReadErrors } = makeReadErrors()
    const { gauge, run } = makeGauge()

    registerRollingActiveUsersGauge(gauge, db, metricReadErrors)
    // Fire two callbacks before the first refresh resolves — the in-flight
    // lock must fold them into a single query.
    await Promise.all([run(), run()])

    expect(select).toHaveBeenCalledTimes(1)
  })
})
