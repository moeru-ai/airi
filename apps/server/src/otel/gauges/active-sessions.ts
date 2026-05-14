import type { AuthMetrics, ObservabilityMetrics } from '..'
import type { Database } from '../../libs/db'

import { useLogger } from '@guiiai/logg'
import { count, gt } from 'drizzle-orm'

import { session as sessionTable } from '../../schemas/accounts'

/**
 * Wire the `user.active_sessions` ObservableGauge to a Postgres `COUNT(*)`
 * over the Better Auth session table.
 *
 * Use when:
 * - Assembling DI in `createApp()`, exactly once per process.
 *
 * Expects:
 * - `gauge` is the ObservableGauge handle created in `initOtel`.
 * - `db` is the migrated Drizzle handle.
 * - `metricReadErrors` is the shared counter used to track failures inside
 *   metric callbacks — increments are labelled with the originating metric
 *   name so on-call can spot which gauge is degraded.
 *
 * Multi-replica note:
 * - This is a cluster-wide gauge — every replica reads the same DB and
 *   reports the same value. Dashboards MUST aggregate with `avg()`, NOT
 *   `sum()`. See observability-conventions.md.
 *
 * Concurrency:
 * - Multiple OTel collection cycles can race (forced flushes, multiple
 *   readers). The in-flight promise lock keeps at most one DB query in
 *   flight per process; all other concurrent callbacks await the same
 *   result instead of stampeding the DB.
 *
 * Failure mode:
 * - On DB error we increment `airi.observability.read_errors{metric}` and
 *   intentionally DO NOT call `result.observe(...)`. Letting the gauge
 *   skip an export cycle lets Prometheus staleness handle "DB is broken"
 *   correctly — an absence-based alert will fire after ~5 minutes. The
 *   previous version silently observed the stale cached value forever,
 *   which masked permanent DB failures.
 */
export function registerActiveSessionsGauge(
  gauge: AuthMetrics['activeSessions'],
  db: Database,
  metricReadErrors: ObservabilityMetrics['metricReadErrors'],
) {
  const log = useLogger('active-sessions-gauge').useGlobalConfig()
  const CACHE_TTL_MS = 10_000

  let cachedAt = 0
  let cachedCount = 0
  // Single shared promise representing "a refresh is in progress". All
  // callbacks that arrive during a refresh attach to this and observe the
  // same outcome. Reset to null when the refresh resolves.
  let refreshInFlight: Promise<boolean> | null = null

  async function refresh(): Promise<boolean> {
    try {
      // Use the app clock (`new Date()`) rather than DB clock (`NOW()`) so
      // we agree with Better Auth's own session validity check, which uses
      // `new Date()` in its session lookup (`better-auth/dist/session.mjs`
      // and `dist/internal-adapter.mjs`). A DB/app clock skew would
      // otherwise let this gauge disagree with auth-layer reality.
      const rows = await db
        .select({ count: count() })
        .from(sessionTable)
        .where(gt(sessionTable.expiresAt, new Date()))
      cachedCount = Number(rows[0]?.count ?? 0)
      cachedAt = Date.now()
      return true
    }
    catch (err) {
      log.withError(err).warn('Failed to read active sessions for gauge')
      metricReadErrors.add(1, { metric: 'user.active_sessions' })
      return false
    }
  }

  gauge.addCallback(async (result) => {
    const now = Date.now()

    // Cache fresh — serve last good value without touching the DB.
    if (cachedAt !== 0 && now - cachedAt < CACHE_TTL_MS) {
      result.observe(cachedCount)
      return
    }

    // Coalesce concurrent refreshes onto one in-flight promise.
    if (!refreshInFlight) {
      refreshInFlight = refresh().finally(() => {
        refreshInFlight = null
      })
    }
    const ok = await refreshInFlight

    if (ok) {
      result.observe(cachedCount)
    }
    // else: deliberately do nothing — let Prometheus staleness expose the
    // outage instead of masking it with a stale cached number.
  })
}
