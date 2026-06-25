import type { AuthMetrics, ObservabilityMetrics } from '..'
import type { Database } from '../../libs/db'

import { useLogger } from '@guiiai/logg'
import { sql } from 'drizzle-orm'

import { user as userTable } from '../../schemas/accounts'

/**
 * Trailing windows reported by the `user.active_rolling` gauge. The `label`
 * becomes the Prometheus `window` attribute (`user_active_rolling{window="24h"}`)
 * and `ms` is the lookback applied to `user.last_seen_at`.
 */
const WINDOWS = [
  { label: '24h', ms: 24 * 60 * 60 * 1000 },
  { label: '7d', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: '30d', ms: 30 * 24 * 60 * 60 * 1000 },
] as const

type WindowLabel = (typeof WINDOWS)[number]['label']
type RollingCounts = Record<WindowLabel, number>

/**
 * Wire the `user.active_rolling` ObservableGauge to a Postgres
 * `COUNT(*) FILTER (WHERE last_seen_at > cutoff)` over the `user` table, one
 * filter per trailing window (DAU / WAU / MAU).
 *
 * Use when:
 * - Assembling DI in `createApp()`, exactly once per process.
 *
 * Why this exists alongside `registerDistinctActiveUsersGauge`:
 * - `user.distinct_active` counts users with a currently non-expired session
 *   ("signed in right now"). It cannot answer "how many users came back this
 *   week" because expired sessions drop out.
 * - `user.active_rolling` reads `user.last_seen_at` — touched on sign-in and
 *   on every OIDC access-token refresh (~hourly) — so it measures activity
 *   over a trailing window regardless of session state. This is the standard
 *   DAU / WAU / MAU engagement funnel.
 *
 * Expects:
 * - `gauge` is the ObservableGauge handle created in `initOtel`.
 * - `db` is the migrated Drizzle handle.
 * - `metricReadErrors` is the shared counter; failures inside the callback
 *   increment it labelled with the originating metric name.
 *
 * Multi-replica note:
 * - Cluster-wide gauge — every replica reads the same DB and reports the same
 *   value per window. Dashboards MUST aggregate with `max()`/`avg()`, NOT
 *   `sum()`. See observability-conventions.md.
 *
 * Concurrency:
 * - Same in-flight promise lock as the sibling gauges, so concurrent OTel
 *   collection cycles fold into one DB query. Cached for 60s — DAU/WAU/MAU
 *   move slowly and the query scans the whole `user` table, so a longer TTL
 *   than the per-row session gauges keeps DB load low.
 *
 * Failure mode:
 * - DB error → increment `airi.observability.read_errors{metric}` and skip
 *   `result.observe(...)`. Prometheus staleness exposes the outage instead of
 *   pinning stale values forever.
 */
export function registerRollingActiveUsersGauge(
  gauge: AuthMetrics['rollingActiveUsers'],
  db: Database,
  metricReadErrors: ObservabilityMetrics['metricReadErrors'],
) {
  const log = useLogger('rolling-active-users-gauge').useGlobalConfig()
  const CACHE_TTL_MS = 60_000

  let cachedAt = 0
  let cached: RollingCounts = { '24h': 0, '7d': 0, '30d': 0 }
  let refreshInFlight: Promise<boolean> | null = null

  async function refresh(): Promise<boolean> {
    try {
      // Compute cutoffs from the app clock so all three windows are anchored
      // to the same instant within one query. `id` is the PK, so
      // `count(*)` == `count(distinct id)` — no DISTINCT needed.
      const now = Date.now()
      const since24h = new Date(now - WINDOWS[0].ms)
      const since7d = new Date(now - WINDOWS[1].ms)
      const since30d = new Date(now - WINDOWS[2].ms)
      const rows = await db
        .select({
          dau: sql<number>`count(*) filter (where ${userTable.lastSeenAt} > ${since24h})`,
          wau: sql<number>`count(*) filter (where ${userTable.lastSeenAt} > ${since7d})`,
          mau: sql<number>`count(*) filter (where ${userTable.lastSeenAt} > ${since30d})`,
        })
        .from(userTable)
      cached = {
        '24h': Number(rows[0]?.dau ?? 0),
        '7d': Number(rows[0]?.wau ?? 0),
        '30d': Number(rows[0]?.mau ?? 0),
      }
      cachedAt = Date.now()
      return true
    }
    catch (err) {
      log.withError(err).warn('Failed to read rolling active users for gauge')
      metricReadErrors.add(1, { metric: 'user.active_rolling' })
      return false
    }
  }

  function observeAll(result: Parameters<Parameters<typeof gauge.addCallback>[0]>[0]) {
    for (const w of WINDOWS)
      result.observe(cached[w.label], { window: w.label })
  }

  gauge.addCallback(async (result) => {
    const now = Date.now()

    // Cache fresh — serve last good values without touching the DB.
    if (cachedAt !== 0 && now - cachedAt < CACHE_TTL_MS) {
      observeAll(result)
      return
    }

    // Coalesce concurrent refreshes onto one in-flight promise.
    if (!refreshInFlight) {
      refreshInFlight = refresh().finally(() => {
        refreshInFlight = null
      })
    }
    const ok = await refreshInFlight

    if (ok)
      observeAll(result)
    // else: deliberately skip observe — let Prometheus staleness expose the
    // DB outage instead of masking it with stale numbers.
  })
}
