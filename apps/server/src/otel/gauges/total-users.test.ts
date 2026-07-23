import type { AuthMetrics, ObservabilityMetrics } from '..'
import type { Database } from '../../libs/db'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { registerTotalUsersGauge } from './total-users'

/**
 * Capture the callback registered via `gauge.addCallback` and a spyable
 * `observe` so tests can drive collection cycles by hand.
 *
 * @example
 * const { gauge, observe, run } = makeGauge()
 * registerTotalUsersGauge(gauge, db, errs)
 * await run()
 * expect(observe).toHaveBeenCalledWith(42)
 */
function makeGauge() {
  let cb: ((result: { observe: (v: number) => void }) => void | Promise<void>) | null = null
  const observe = vi.fn()
  const gauge = {
    addCallback: vi.fn((fn: typeof cb) => { cb = fn }),
  } as unknown as AuthMetrics['totalUsers']
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
 * const db = makeDb([{ count: '12' }])
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

describe('registerTotalUsersGauge', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('observes the total user count from the user table', async () => {
    const { db } = makeDb([{ count: '42' }])
    const { metricReadErrors } = makeReadErrors()
    const { gauge, observe, run } = makeGauge()

    registerTotalUsersGauge(gauge, db, metricReadErrors)
    await run()

    expect(observe).toHaveBeenCalledWith(42)
  })

  it('serves cached values without re-querying inside the 60s TTL', async () => {
    const { db, select } = makeDb([{ count: '3' }])
    const { metricReadErrors } = makeReadErrors()
    const { gauge, observe, run } = makeGauge()

    registerTotalUsersGauge(gauge, db, metricReadErrors)
    await run()
    await vi.advanceTimersByTimeAsync(30_000)
    await run()

    expect(select).toHaveBeenCalledTimes(1)
    expect(observe).toHaveBeenCalledTimes(2)
  })

  it('on DB error: increments read-errors and does not observe', async () => {
    // ROOT CAUSE:
    //
    // A total-user gauge that observes a stale/zero value on DB failure masks
    // the outage forever — an absence-based alert can never fire.
    //
    // We fixed this by skipping result.observe(...) on error and bumping
    // airi.observability.read_errors{metric}, so Prometheus staleness exposes
    // the broken DB instead.
    const { db } = makeDb([], { reject: true })
    const { metricReadErrors, add } = makeReadErrors()
    const { gauge, observe, run } = makeGauge()

    registerTotalUsersGauge(gauge, db, metricReadErrors)
    await run()

    expect(observe).not.toHaveBeenCalled()
    expect(add).toHaveBeenCalledWith(1, { metric: 'user.total' })
  })
})
