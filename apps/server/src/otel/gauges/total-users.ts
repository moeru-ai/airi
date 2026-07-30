import type { AuthMetrics, ObservabilityMetrics } from '..'
import type { Database } from '../../libs/db'

import { useLogger } from '@guiiai/logg'
import { count } from 'drizzle-orm'

import { user as userTable } from '../../schemas/accounts'

/**
 * Wire the `user.total` ObservableGauge to a Postgres `COUNT(*)` over the
 * Better Auth user table.
 *
 * Use when:
 * - Assembling DI in `createApp()`, exactly once per process.
 *
 * Expects:
 * - `gauge` is the ObservableGauge handle created in `initOtel`.
 * - `db` is the migrated Drizzle handle.
 * - `metricReadErrors` is the shared counter used to track failures inside
 *   metric callbacks.
 *
 * Multi-replica note:
 * - Cluster-wide gauge — every replica reads the same DB and reports the same
 *   value. Dashboards MUST aggregate with `max()`/`avg()`, NOT `sum()`.
 *
 * Concurrency:
 * - Same in-flight promise lock as the sibling DB-backed gauges, so concurrent
 *   OTel collection cycles fold into one DB query.
 *
 * Failure mode:
 * - DB error → increment `airi.observability.read_errors{metric}` and skip
 *   `result.observe(...)`. Prometheus staleness exposes the outage instead of
 *   pinning stale values forever.
 */
export function registerTotalUsersGauge(
  gauge: AuthMetrics['totalUsers'],
  db: Database,
  metricReadErrors: ObservabilityMetrics['metricReadErrors'],
) {
  const log = useLogger('total-users-gauge').useGlobalConfig()
  const CACHE_TTL_MS = 60_000

  let cachedAt = 0
  let cachedCount = 0
  let refreshInFlight: Promise<boolean> | null = null

  async function refresh(): Promise<boolean> {
    try {
      const rows = await db
        .select({ count: count() })
        .from(userTable)
      cachedCount = Number(rows[0]?.count ?? 0)
      cachedAt = Date.now()
      return true
    }
    catch (err) {
      log.withError(err).warn('Failed to read total users for gauge')
      metricReadErrors.add(1, { metric: 'user.total' })
      return false
    }
  }

  gauge.addCallback(async (result) => {
    const now = Date.now()

    if (cachedAt !== 0 && now - cachedAt < CACHE_TTL_MS) {
      result.observe(cachedCount)
      return
    }

    if (!refreshInFlight) {
      refreshInFlight = refresh().finally(() => {
        refreshInFlight = null
      })
    }
    const ok = await refreshInFlight

    if (ok)
      result.observe(cachedCount)
  })
}
