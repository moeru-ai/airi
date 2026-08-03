import type { AuthMetrics, ObservabilityMetrics } from '..'
import type { Database } from '../../libs/db'

import { useLogger } from '@guiiai/logg'
import { countDistinct, gt } from 'drizzle-orm'

import { session as sessionTable } from '../../schemas/accounts'

/**
 * Wire the `user.distinct_active` ObservableGauge to a Postgres
 * `COUNT(DISTINCT user_id)` over the Better Auth session table.
 *
 * Use when:
 * - Assembling DI in `createApp()`, exactly once per process.
 *
 * Why this exists alongside `registerActiveSessionsGauge`:
 * - `user.active_sessions` is `COUNT(*)` — counts session **rows**. Better
 *   Auth creates a new row per sign-in and per OIDC access-token issuance
 *   (the `oauth_access_token` table has a FK to `session.id`) and never GCs
 *   expired rows, so the row-count drifts up over time independently of
 *   the real user base. We've seen this metric show ~80K on a small
 *   deployment where the real distinct-user count is ~hundreds.
 * - `user.distinct_active` is `COUNT(DISTINCT user_id)` — the actual
 *   active-user gauge. Pair with `user.active_sessions` to spot session
 *   inflation: if rows / users ratio climbs past ~5 it's probably time
 *   to add a session-GC cron or shorten Better Auth's `expiresIn`.
 *
 * Multi-replica note:
 * - Cluster-wide gauge — every replica reads the same DB and reports the
 *   same value. Dashboards MUST aggregate with `avg()`, NOT `sum()`. See
 *   observability-conventions.md.
 *
 * Concurrency:
 * - Same in-flight promise lock pattern as `registerActiveSessionsGauge`,
 *   so concurrent OTel collection cycles fold into one DB query.
 *
 * Failure mode:
 * - DB error → increment `airi.observability.read_errors{metric}` and skip
 *   `result.observe(...)`. Prometheus staleness exposes the outage instead
 *   of pinning a stale cached value forever.
 */
export function registerDistinctActiveUsersGauge(
  gauge: AuthMetrics['distinctActiveUsers'],
  db: Database,
  metricReadErrors: ObservabilityMetrics['metricReadErrors'],
) {
  const log = useLogger('distinct-active-users-gauge').useGlobalConfig()
  const CACHE_TTL_MS = 10_000

  let cachedAt = 0
  let cachedCount = 0
  let refreshInFlight: Promise<boolean> | null = null

  async function refresh(): Promise<boolean> {
    try {
      // Use the app clock (`new Date()`) for the same reason as
      // `registerActiveSessionsGauge`: agree with Better Auth's own
      // session-validity check, which uses `new Date()` rather than
      // `NOW()`.
      const rows = await db
        .select({ count: countDistinct(sessionTable.userId) })
        .from(sessionTable)
        .where(gt(sessionTable.expiresAt, new Date()))
      cachedCount = Number(rows[0]?.count ?? 0)
      cachedAt = Date.now()
      return true
    }
    catch (err) {
      log.withError(err).warn('Failed to read distinct active users for gauge')
      metricReadErrors.add(1, { metric: 'user.distinct_active' })
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

    if (ok) {
      result.observe(cachedCount)
    }
  })
}
