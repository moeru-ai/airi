import type { IncomingMessage } from 'node:http'

import type { Env } from './env'

import { env as processEnv } from 'node:process'

import { useLogger } from '@guiiai/logg'
import { diag, DiagConsoleLogger, DiagLogLevel, metrics } from '@opentelemetry/api'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis'
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg'
import { RuntimeNodeInstrumentation } from '@opentelemetry/instrumentation-runtime-node'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { BatchSpanProcessor, ParentBasedSampler, TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-node'
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'

const logger = useLogger('otel')

export function initOtel(env: Env) {
  const otlpEndpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT
  const serviceName = env.OTEL_SERVICE_NAME

  if (!otlpEndpoint) {
    logger.log('OpenTelemetry disabled (set OTEL_EXPORTER_OTLP_ENDPOINT to enable)')
    return
  }

  if (env.OTEL_DEBUG === 'true') {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG)
  }

  // Parse OTEL_EXPORTER_OTLP_HEADERS (format: "key=value,key2=value2")
  const headers: Record<string, string> = {}
  const rawHeaders = env.OTEL_EXPORTER_OTLP_HEADERS
  if (rawHeaders) {
    for (const pair of rawHeaders.split(',')) {
      const idx = pair.indexOf('=')
      if (idx > 0) {
        headers[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim()
      }
    }
  }

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: processEnv.npm_package_version || '0.0.0',
    'service.namespace': env.OTEL_SERVICE_NAMESPACE,
    'deployment.environment': processEnv.NODE_ENV || 'development',
  })

  const traceExporter = new OTLPTraceExporter({
    url: `${otlpEndpoint}/v1/traces`,
    headers,
  })

  const metricExporter = new OTLPMetricExporter({
    url: `${otlpEndpoint}/v1/metrics`,
    headers,
  })

  const logExporter = new OTLPLogExporter({
    url: `${otlpEndpoint}/v1/logs`,
    headers,
  })

  // Head-based sampling ratio: 1.0 = 100% (default), 0.1 = 10%, etc.
  // Metrics are always 100% accurate regardless of this setting.
  const samplingRatio = Number.parseFloat(env.OTEL_TRACES_SAMPLING_RATIO)
  const sampler = new ParentBasedSampler({
    root: new TraceIdRatioBasedSampler(samplingRatio),
  })

  const sdk = new NodeSDK({
    resource,
    sampler,
    spanProcessors: [new BatchSpanProcessor(traceExporter)],
    metricReaders: [new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 15_000,
      exportTimeoutMillis: 10_000,
    })],
    logRecordProcessors: [new BatchLogRecordProcessor(logExporter)],
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (req: IncomingMessage) => {
          // Ignore health check requests to reduce noise
          return req.url === '/health'
        },
      }),
      new PgInstrumentation({
        enhancedDatabaseReporting: true,
      }),
      new IORedisInstrumentation(),
      new RuntimeNodeInstrumentation(),
    ],
  })

  // SDK must start BEFORE metrics.getMeter() — the metrics API does NOT
  // have a proxy mechanism like traces. getMeter() called before start()
  // returns a permanent NoopMeter that never upgrades.
  sdk.start()
  logger.log(`OpenTelemetry initialized, exporting to ${otlpEndpoint}, sampling ratio: ${samplingRatio}`)

  const meter = metrics.getMeter(serviceName)

  // Custom application metrics
  const httpRequestDuration = meter.createHistogram('http.server.request.duration', {
    description: 'HTTP server request duration in milliseconds',
    unit: 'ms',
  })

  const httpActiveRequests = meter.createUpDownCounter('http.server.active_requests', {
    description: 'Number of active HTTP requests',
  })

  const dbQueryDuration = meter.createHistogram('db.client.operation.duration', {
    description: 'Database operation duration in milliseconds',
    unit: 'ms',
  })

  const redisCommandDuration = meter.createHistogram('redis.client.command.duration', {
    description: 'Redis command duration in milliseconds',
    unit: 'ms',
  })

  const authAttempts = meter.createCounter('auth.attempts', {
    description: 'Number of authentication attempts',
  })

  const authFailures = meter.createCounter('auth.failures', {
    description: 'Number of failed authentication attempts',
  })

  const stripeEvents = meter.createCounter('stripe.events', {
    description: 'Number of Stripe webhook events processed',
  })

  // Graceful shutdown
  const shutdown = async () => {
    try {
      await sdk.shutdown()
      logger.log('OpenTelemetry shut down successfully')
    }
    catch (err) {
      logger.withError(err).error('Error shutting down OpenTelemetry')
    }
  }

  return {
    sdk,
    meter,
    httpRequestDuration,
    httpActiveRequests,
    dbQueryDuration,
    redisCommandDuration,
    authAttempts,
    authFailures,
    stripeEvents,

    shutdown,
  }
}
