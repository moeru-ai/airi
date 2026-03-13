import type { IncomingMessage } from 'node:http'

import type { Counter, Histogram, UpDownCounter } from '@opentelemetry/api'

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

export interface HttpMetrics {
  requestDuration: Histogram
  activeRequests: UpDownCounter
}

export interface AuthMetrics {
  attempts: Counter
  failures: Counter
  userRegistered: Counter
  userLogin: Counter
  activeSessions: UpDownCounter
}

export interface EngagementMetrics {
  chatSync: Counter
  chatMessages: Counter
  characterCreated: Counter
  characterDeleted: Counter
  characterEngagement: Counter
}

export interface RevenueMetrics {
  stripeCheckoutCreated: Counter
  stripeCheckoutCompleted: Counter
  stripePaymentFailed: Counter
  stripeSubscriptionEvent: Counter
  stripeEvents: Counter
  fluxInsufficientBalance: Counter
}

export interface LlmMetrics {
  requestDuration: Histogram
  requestCount: Counter
  tokensPrompt: Counter
  tokensCompletion: Counter
  fluxConsumed: Counter
}

export interface DbMetrics {
  queryDuration: Histogram
  redisCommandDuration: Histogram
}

export interface OtelInstance {
  sdk: NodeSDK
  http: HttpMetrics
  auth: AuthMetrics
  engagement: EngagementMetrics
  revenue: RevenueMetrics
  llm: LlmMetrics
  db: DbMetrics
  shutdown: () => Promise<void>
}

export function initOtel(env: Env): OtelInstance | undefined {
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

  // HTTP metrics
  const http: HttpMetrics = {
    requestDuration: meter.createHistogram('http.server.request.duration', {
      description: 'HTTP server request duration in milliseconds',
      unit: 'ms',
    }),
    activeRequests: meter.createUpDownCounter('http.server.active_requests', {
      description: 'Number of active HTTP requests',
    }),
  }

  // Auth & User metrics
  const auth: AuthMetrics = {
    attempts: meter.createCounter('auth.attempts', {
      description: 'Number of authentication attempts',
    }),
    failures: meter.createCounter('auth.failures', {
      description: 'Number of failed authentication attempts',
    }),
    userRegistered: meter.createCounter('user.registered', {
      description: 'Number of new user registrations',
    }),
    userLogin: meter.createCounter('user.login', {
      description: 'Number of user logins',
    }),
    activeSessions: meter.createUpDownCounter('user.active_sessions', {
      description: 'Number of active user sessions',
    }),
  }

  // Engagement metrics
  const engagement: EngagementMetrics = {
    chatSync: meter.createCounter('chat.sync', {
      description: 'Number of chat sync operations',
    }),
    chatMessages: meter.createCounter('chat.messages', {
      description: 'Number of chat messages synced',
    }),
    characterCreated: meter.createCounter('character.created', {
      description: 'Number of characters created',
    }),
    characterDeleted: meter.createCounter('character.deleted', {
      description: 'Number of characters deleted',
    }),
    characterEngagement: meter.createCounter('character.engagement', {
      description: 'Number of character engagement actions (like/bookmark)',
    }),
  }

  // Revenue metrics
  const revenue: RevenueMetrics = {
    stripeCheckoutCreated: meter.createCounter('stripe.checkout.created', {
      description: 'Number of Stripe checkout sessions created',
    }),
    stripeCheckoutCompleted: meter.createCounter('stripe.checkout.completed', {
      description: 'Number of Stripe checkout sessions completed',
    }),
    stripePaymentFailed: meter.createCounter('stripe.payment.failed', {
      description: 'Number of failed Stripe payments',
    }),
    stripeSubscriptionEvent: meter.createCounter('stripe.subscription.event', {
      description: 'Number of Stripe subscription lifecycle events',
    }),
    stripeEvents: meter.createCounter('stripe.events', {
      description: 'Number of Stripe webhook events processed',
    }),
    fluxInsufficientBalance: meter.createCounter('flux.insufficient_balance', {
      description: 'Number of insufficient flux balance errors',
    }),
  }

  // LLM / Gateway metrics
  const llm: LlmMetrics = {
    requestDuration: meter.createHistogram('llm.request.duration', {
      description: 'LLM gateway request duration in milliseconds',
      unit: 'ms',
    }),
    requestCount: meter.createCounter('llm.request.count', {
      description: 'Number of LLM gateway requests',
    }),
    tokensPrompt: meter.createCounter('llm.tokens.prompt', {
      description: 'Total prompt tokens consumed',
    }),
    tokensCompletion: meter.createCounter('llm.tokens.completion', {
      description: 'Total completion tokens consumed',
    }),
    fluxConsumed: meter.createCounter('flux.consumed', {
      description: 'Total flux consumed',
    }),
  }

  // Database metrics
  const db: DbMetrics = {
    queryDuration: meter.createHistogram('db.client.operation.duration', {
      description: 'Database operation duration in milliseconds',
      unit: 'ms',
    }),
    redisCommandDuration: meter.createHistogram('redis.client.command.duration', {
      description: 'Redis command duration in milliseconds',
      unit: 'ms',
    }),
  }

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
    http,
    auth,
    engagement,
    revenue,
    llm,
    db,
    shutdown,
  }
}
