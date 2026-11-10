import process, { env } from 'node:process'

/**
 * Auth-server OpenTelemetry preload.
 *
 * Loaded before application modules so PostgreSQL, Redis, HTTP, and fetch
 * instrumentation can patch their runtimes before the auth composition root
 * imports those clients.
 */
import { randomUUID } from 'node:crypto'

import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis'
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg'
import { RuntimeNodeInstrumentation } from '@opentelemetry/instrumentation-runtime-node'
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { BatchSpanProcessor, ParentBasedSampler, TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-node'
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'

if (!env.OTEL_SEMCONV_STABILITY_OPT_IN)
  env.OTEL_SEMCONV_STABILITY_OPT_IN = 'http'

const otlpEndpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT
if (!otlpEndpoint) {
  console.info('[otel-preload] Auth OpenTelemetry disabled (set OTEL_EXPORTER_OTLP_ENDPOINT to enable)')
}
else {
  if (env.OTEL_DEBUG === 'true')
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG)

  const headers: Record<string, string> = {}
  for (const pair of (env.OTEL_EXPORTER_OTLP_HEADERS ?? '').split(',')) {
    const separator = pair.indexOf('=')
    if (separator > 0)
      headers[pair.slice(0, separator).trim()] = pair.slice(separator + 1).trim()
  }

  const samplingRatioRaw = Number(env.OTEL_TRACES_SAMPLING_RATIO ?? '1')
  const samplingRatio = Number.isFinite(samplingRatioRaw) && samplingRatioRaw >= 0 && samplingRatioRaw <= 1
    ? samplingRatioRaw
    : 1
  const instanceId = env.RAILWAY_REPLICA_ID || env.SERVER_INSTANCE_ID || randomUUID()
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: env.OTEL_SERVICE_NAME || 'auth-server',
    [ATTR_SERVICE_VERSION]: env.npm_package_version || '0.0.0',
    'deployment.environment': env.NODE_ENV || 'development',
    'service.instance.id': instanceId,
    'service.namespace': env.OTEL_SERVICE_NAMESPACE || 'airi',
  })

  const sdk = new NodeSDK({
    instrumentations: [
      new HttpInstrumentation({ disableIncomingRequestInstrumentation: true }),
      new PgInstrumentation({ enhancedDatabaseReporting: true }),
      new IORedisInstrumentation(),
      new RuntimeNodeInstrumentation(),
      new UndiciInstrumentation(),
    ],
    logRecordProcessors: [new BatchLogRecordProcessor({
      exporter: new OTLPLogExporter({
        headers,
        url: `${otlpEndpoint}/v1/logs`,
      }),
    })],
    metricReaders: [new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ headers, url: `${otlpEndpoint}/v1/metrics` }),
      exportIntervalMillis: 15_000,
      exportTimeoutMillis: 10_000,
    })],
    resource,
    sampler: new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(samplingRatio) }),
    spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter({
      headers,
      url: `${otlpEndpoint}/v1/traces`,
    }))],
  })

  sdk.start()
  console.info(`[otel-preload] Auth OpenTelemetry initialized — OTLP: ${otlpEndpoint}, sampling ratio: ${samplingRatio}`)

  let shuttingDown = false
  const shutdown = async () => {
    if (shuttingDown)
      return
    shuttingDown = true
    try {
      await sdk.shutdown()
      console.info('[otel-preload] Auth OpenTelemetry shut down successfully')
    }
    catch (error) {
      console.error('[otel-preload] Failed to shut down Auth OpenTelemetry:', error)
    }
  }

  process.once('SIGTERM', () => void shutdown().finally(() => process.exit(0)))
  process.once('SIGINT', () => void shutdown().finally(() => process.exit(0)))
}
