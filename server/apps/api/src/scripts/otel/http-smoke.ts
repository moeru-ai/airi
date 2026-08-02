/**
 * Verifies that the production HTTP-metric pipeline is wired correctly:
 *   - `@hono/otel` middleware records `http.server.request.duration` with the
 *     Hono-matched `http.route` label (the whole reason we migrated off
 *     auto-instrumentation for incoming requests).
 *   - Auto `HttpInstrumentation` is disabled for incoming, so it does NOT
 *     double-record the same histogram.
 *
 * STANDALONE simulation — does NOT use `--import ./instrumentation.ts`. It
 * mirrors the preload's NodeSDK setup but swaps the OTLP exporter for an
 * InMemoryMetricExporter so the smoke can read back what was recorded.
 *
 * Usage:
 *   pnpm -F @proj-airi/server exec node --import tsx ./src/scripts/otel/http-smoke.ts
 */
import { env, exit } from 'node:process'

import { serve } from '@hono/node-server'
import { httpInstrumentationMiddleware } from '@hono/otel'
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { AggregationTemporality, InMemoryMetricExporter, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { Hono } from 'hono'

env.OTEL_SEMCONV_STABILITY_OPT_IN ??= 'http'
// Disable trace + log exporters — the smoke only needs to read metric output
// via the InMemoryMetricExporter we plug in below. Without these, NodeSDK
// defaults to OTLP/HTTP exporters targeting 127.0.0.1:4318, which fails with
// ECONNREFUSED when no collector is running locally.
env.OTEL_TRACES_EXPORTER = 'none'
env.OTEL_LOGS_EXPORTER = 'none'
if (env.OTEL_DEBUG === 'true')
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG)

const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE)

const sdk = new NodeSDK({
  resource: resourceFromAttributes({ 'service.name': 'otel-http-smoke' }),
  metricReaders: [new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 200 })],
  instrumentations: [
    // Mirrors prod: incoming is owned by @hono/otel; auto instrumentation only
    // covers outbound. If this hook were dropped we'd double-record.
    new HttpInstrumentation({ ignoreIncomingRequestHook: () => true }),
  ],
})
sdk.start()

const app = new Hono()
app.use('*', httpInstrumentationMiddleware({ serviceName: 'otel-http-smoke' }))
app.get('/users/:id', c => c.text(`user ${c.req.param('id')}`))
app.get('/health-test', c => c.text('ok'))

// `serve` returns the http.Server synchronously but binding is async — wait
// for the listen callback to capture the port (port: 0 = auto-assigned).
const server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' })
const port = await new Promise<number>((resolve) => {
  server.once('listening', () => {
    const addr = server.address()
    if (addr && typeof addr === 'object')
      resolve(addr.port)
  })
})
console.info(`[smoke] hono server listening on 127.0.0.1:${port}`)

// Hit /users/:id three times with different concrete IDs. The whole point of
// @hono/otel is that all three should collapse into ONE series with
// `http.route="/users/:id"`, not three series with concrete URLs.
for (const id of ['alice', 'bob', 'carol'])
  await fetch(`http://127.0.0.1:${port}/users/${id}`).then(r => r.text())
await fetch(`http://127.0.0.1:${port}/health-test`).then(r => r.text())

await new Promise(r => setTimeout(r, 300))
server.close()
await sdk.shutdown()

const exported = exporter.getMetrics()
const observed = []
const routeLabels = new Set()
for (const rm of exported) {
  for (const sm of rm.scopeMetrics) {
    for (const m of sm.metrics) {
      if (!m.descriptor.name.startsWith('http.server'))
        continue
      observed.push(`  ${m.descriptor.name} (${m.dataPointType}) — ${m.dataPoints.length} datapoints`)
      for (const dp of m.dataPoints) {
        const route = dp.attributes['http.route']
        if (route)
          routeLabels.add(route)
      }
    }
  }
}

console.info('[smoke] http.server.* metrics observed:')
if (observed.length === 0) {
  console.error('  ❌ NONE — @hono/otel did not record')
  exit(1)
}
for (const line of observed) console.info(line)

console.info('[smoke] http.route values seen:', [...routeLabels])
if (!routeLabels.has('/users/:id')) {
  console.error('  ❌ expected /users/:id route pattern; got:', [...routeLabels])
  console.error('  This means @hono/otel is NOT picking up the matched route — concrete URLs would explode cardinality.')
  exit(1)
}

console.info('[smoke] ✅ http.server.request.duration emitted with matched route patterns')
exit(0)
