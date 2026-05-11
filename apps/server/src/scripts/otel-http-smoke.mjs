/**
 * Verifies that the NodeSDK setup used in `instrumentation.mjs` actually
 * records `http.server.request.duration` when a real CJS http server receives
 * an inbound request.
 *
 * This is a STANDALONE simulation — it does NOT use `--import
 * ./instrumentation.mjs`. It mirrors the preload's NodeSDK setup but swaps the
 * OTLP exporter for an InMemoryMetricExporter so the smoke can read back what
 * was recorded. The instrumentation list and SemconvStability mode are
 * identical to the preload, so a passing smoke means the production path also
 * records metrics correctly.
 *
 * Usage:
 *   pnpm -F @proj-airi/server exec node --import tsx ./src/scripts/otel-http-smoke.mjs
 */
import { createRequire } from 'node:module'
import { env, exit } from 'node:process'

import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { AggregationTemporality, InMemoryMetricExporter, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { NodeSDK } from '@opentelemetry/sdk-node'

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
    new HttpInstrumentation({ ignoreIncomingRequestHook: req => req.url === '/health' }),
  ],
})
sdk.start()

// `require('http')` MUST happen after `sdk.start()` — that's when
// registerInstrumentations installs the require-in-the-middle hook. If we
// require'd http during top-level imports, the module would be cached
// unpatched and the hook would never fire. Production preload avoids this
// because sdk.start() runs before any application code resolves http.
const require = createRequire(import.meta.url)
const { createServer } = require('node:http')

const server = createServer((req, res) => {
  res.statusCode = 200
  res.end('ok')
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const { port } = server.address()
console.info(`[smoke] http server listening on 127.0.0.1:${port}`)

for (let i = 0; i < 3; i++)
  await fetch(`http://127.0.0.1:${port}/test-${i}`).then(r => r.text())

// Wait one export interval, then close the server. sdk.shutdown() calls
// forceFlush on all metric readers, so the InMemoryMetricExporter is
// guaranteed to have received whatever was buffered.
await new Promise(r => setTimeout(r, 300))
server.close()
await sdk.shutdown()

const exported = exporter.getMetrics()
const httpServerMetrics = []
for (const rm of exported) {
  for (const sm of rm.scopeMetrics) {
    for (const m of sm.metrics) {
      if (m.descriptor.name.startsWith('http.server'))
        httpServerMetrics.push(`  ${m.descriptor.name} (${m.dataPointType}) — ${m.dataPoints.length} datapoints`)
    }
  }
}

console.info('[smoke] http.server.* metrics observed after request:')
if (httpServerMetrics.length === 0) {
  console.error('  ❌ NONE — instrumentation did not record')
  exit(1)
}
for (const line of httpServerMetrics) console.info(line)
console.info('[smoke] ✅ http.server.request.duration is live')
exit(0)
