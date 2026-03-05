import process from 'node:process'

import { DiagConsoleLogger, DiagLogLevel, diag, metrics } from '@opentelemetry/api'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto'
import { Resource } from '@opentelemetry/resources'
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node'
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis'
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg'
import { RuntimeNodeInstrumentation } from '@opentelemetry/instrumentation-runtime-node'
import { useLogger } from '@guiiai/logg'

const logger = useLogger('otel')

export function initOtel() {
  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318'
  const serviceName = process.env.OTEL_SERVICE_NAME || 'airi-server'

  if (process.env.OTEL_DEBUG === 'true') {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG)
  }

  const resource = new Resource({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: process.env.npm_package_version || '0.0.0',
    'deployment.environment': process.env.NODE_ENV || 'development',
  })

  const traceExporter = new OTLPTraceExporter({
    url: `${otlpEndpoint}/v1/traces`,
  })

  const metricExporter = new OTLPMetricExporter({
    url: `${otlpEndpoint}/v1/metrics`,
  })

  const logExporter = new OTLPLogExporter({
    url: `${otlpEndpoint}/v1/logs`,
  })

  const sdk = new NodeSDK({
    resource,
    spanProcessors: [new BatchSpanProcessor(traceExporter)],
    metricReader: new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 15000,
    }),
    logRecordProcessors: [new BatchLogRecordProcessor(logExporter)],
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (req) => {
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

  sdk.start()
  logger.log(`OpenTelemetry initialized, exporting to ${otlpEndpoint}`)

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

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

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
  }
}
