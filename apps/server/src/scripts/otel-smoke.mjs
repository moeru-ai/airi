/**
 * OTel metric-registration smoke test.
 *
 * Verifies every Counter created by `initOtel` is primed (.add(0)) so the
 * Prometheus exporter sees the time series at boot, not just after the first
 * real event. Without priming, low-traffic counters
 * (auth_failures_total, stripe_*_total, payment_failed, ...) never appear in
 * Grafana until an event happens — making panels look broken on fresh deploys
 * and absence-based alerts impossible to author.
 *
 * Histograms (gen_ai.client.first_token.duration, airi.email.duration, ...)
 * are intentionally NOT in the output — they only register on first .record().
 *
 * Usage:
 *   pnpm -F @proj-airi/server exec node --import tsx ./src/scripts/otel-smoke.mjs
 */
import { env, exit } from 'node:process'

import { metrics } from '@opentelemetry/api'
import { AggregationTemporality, InMemoryMetricExporter, MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'

const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE)
const reader = new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 100 })
const provider = new MeterProvider({ readers: [reader] })
metrics.setGlobalMeterProvider(provider)

// Smoke-test env: stand in for required vars so parseEnv passes; OTLP endpoint
// is set to a localhost URL that won't actually receive anything because we
// flush via the in-memory reader.
env.DATABASE_URL ??= 'postgres://test'
env.REDIS_URL ??= 'redis://test'
env.BETTER_AUTH_SECRET ??= 'test'
env.AUTH_GOOGLE_CLIENT_ID ??= 'test'
env.AUTH_GOOGLE_CLIENT_SECRET ??= 'test'
env.AUTH_GITHUB_CLIENT_ID ??= 'test'
env.AUTH_GITHUB_CLIENT_SECRET ??= 'test'
env.GATEWAY_BASE_URL ??= 'http://test'
env.DEFAULT_CHAT_MODEL ??= 'test'
env.DEFAULT_TTS_MODEL ??= 'test'
env.OTEL_EXPORTER_OTLP_ENDPOINT ??= 'http://localhost:4318'

const { initOtel } = await import('../libs/otel.ts')
const { parseEnv } = await import('../libs/env.ts')

const parsed = parseEnv(env)
const inst = initOtel(parsed)
if (!inst) {
  console.error('initOtel returned undefined')
  exit(1)
}

await new Promise(r => setTimeout(r, 300))
await reader.forceFlush()
const exported = exporter.getMetrics()
const names = []
for (const rm of exported) {
  for (const sm of rm.scopeMetrics) {
    for (const m of sm.metrics) names.push(m.descriptor.name)
  }
}
console.info('REGISTERED:')
for (const n of [...new Set(names)].sort()) console.info(`  ${n}`)
await inst.shutdown()
exit(0)
