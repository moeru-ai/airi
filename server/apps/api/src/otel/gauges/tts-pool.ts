import type { GatewayMetrics, ObservabilityMetrics } from '..'
import type { ConcurrencyLedger } from '../../services/domain/llm-router/concurrency-ledger'

import { useLogger } from '@guiiai/logg'

/**
 * Wire the `airi.gen_ai.gateway.pool.inflight` ObservableGauge to the Redis-backed
 *pool concurrency ledger, emitting one series per app_id.
 *
 * Use when:
 * - Assembling DI in `createApp()`, exactly once per process, only when OTel is
 *   enabled.
 *
 * Expects:
 * - `gauge` is the ObservableGauge handle from `initOtel`.
 * - `ledger` is the same concurrency ledger the TTS router acquires slots on.
 * - `metricReadErrors` is the shared self-monitoring counter, labelled by the
 *   originating metric name.
 *
 * Multi-replica note:
 * - Cluster-wide gauge — every replica reads the same Redis counters and reports
 *   the same per-pool value. Dashboards MUST aggregate with `avg()`, NOT `sum()`.
 *   See observability-conventions.md.
 *
 * Concurrency:
 * - Multiple OTel collection cycles can race. The in-flight promise lock keeps at
 *   most one Redis snapshot in flight per process; concurrent callbacks await the
 *   same result rather than stampeding Redis.
 *
 * Failure mode:
 * - On Redis error we increment `airi.observability.read_errors{metric}` and
 *   intentionally DO NOT observe — letting the gauge skip an export cycle lets
 *   Prometheus staleness expose the outage instead of masking it with a stale value.
 */
export function registerTtsPoolGauge(
  gauge: GatewayMetrics['poolInflight'],
  ledger: ConcurrencyLedger,
  metricReadErrors: ObservabilityMetrics['metricReadErrors'],
) {
  const log = useLogger('tts-pool-gauge').useGlobalConfig()
  const CACHE_TTL_MS = 10_000

  let cachedAt = 0
  let cachedSnapshot: Array<{ poolId: string, inflight: number }> = []
  let refreshInFlight: Promise<boolean> | null = null

  async function refresh(): Promise<boolean> {
    try {
      cachedSnapshot = await ledger.snapshot()
      cachedAt = Date.now()
      return true
    }
    catch (err) {
      log.withError(err).warn('Failed to read tts pool snapshot for gauge')
      metricReadErrors.add(1, { metric: 'airi.gen_ai.gateway.pool.inflight' })
      return false
    }
  }

  gauge.addCallback(async (result) => {
    const now = Date.now()

    if (cachedAt !== 0 && now - cachedAt < CACHE_TTL_MS) {
      for (const { poolId, inflight } of cachedSnapshot)
        result.observe(inflight, { app_id: poolId })
      return
    }

    if (!refreshInFlight) {
      refreshInFlight = refresh().finally(() => {
        refreshInFlight = null
      })
    }
    const ok = await refreshInFlight

    if (ok) {
      for (const { poolId, inflight } of cachedSnapshot)
        result.observe(inflight, { app_id: poolId })
    }
    // else: deliberately do nothing — let Prometheus staleness expose the outage.
  })
}
