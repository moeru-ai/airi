import type { Counter, Histogram, ObservableGauge, UpDownCounter } from '@opentelemetry/api'

import type { Env } from './env'

import { env as processEnv } from 'node:process'

import { useLogger } from '@guiiai/logg'
import { diag, DiagConsoleLogger, DiagLogLevel, metrics, trace } from '@opentelemetry/api'
import { logs, SeverityNumber } from '@opentelemetry/api-logs'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { RuntimeNodeInstrumentation } from '@opentelemetry/instrumentation-runtime-node'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { BatchSpanProcessor, ParentBasedSampler, TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-node'
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'

import {
  METRIC_AIRI_EMAIL_DURATION,
  METRIC_AIRI_EMAIL_FAILURES,
  METRIC_AIRI_EMAIL_SEND,
  METRIC_AIRI_FLUX_CREDITED,
  METRIC_AIRI_FLUX_UNBILLED,
  METRIC_AIRI_GEN_AI_STREAM_INTERRUPTED,
  METRIC_AIRI_RATE_LIMIT_BLOCKED,
  METRIC_AIRI_STRIPE_REVENUE,
  METRIC_AIRI_TTS_CHARS,
  METRIC_AIRI_TTS_PREFLIGHT_REJECTIONS,
  METRIC_AUTH_ATTEMPTS,
  METRIC_AUTH_FAILURES,
  METRIC_CHARACTER_CREATED,
  METRIC_CHARACTER_DELETED,
  METRIC_CHARACTER_ENGAGEMENT,
  METRIC_CHAT_MESSAGES,
  METRIC_FLUX_CONSUMED,
  METRIC_FLUX_INSUFFICIENT_BALANCE,
  METRIC_GEN_AI_CLIENT_FIRST_TOKEN_DURATION,
  METRIC_GEN_AI_CLIENT_OPERATION_COUNT,
  METRIC_GEN_AI_CLIENT_OPERATION_DURATION,
  METRIC_GEN_AI_CLIENT_TOKEN_USAGE_INPUT,
  METRIC_GEN_AI_CLIENT_TOKEN_USAGE_OUTPUT,
  METRIC_HTTP_SERVER_ACTIVE_REQUESTS,
  METRIC_HTTP_SERVER_REQUEST_DURATION,
  METRIC_STRIPE_CHECKOUT_COMPLETED,
  METRIC_STRIPE_CHECKOUT_CREATED,
  METRIC_STRIPE_EVENTS,
  METRIC_STRIPE_PAYMENT_FAILED,
  METRIC_STRIPE_SUBSCRIPTION_EVENT,
  METRIC_USER_ACTIVE_SESSIONS,
  METRIC_USER_LOGIN,
  METRIC_USER_REGISTERED,
  METRIC_WS_CONNECTIONS_ACTIVE,
  METRIC_WS_MESSAGES_RECEIVED,
  METRIC_WS_MESSAGES_SENT,
} from '../utils/observability'

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
  chatMessages: Counter
  characterCreated: Counter
  characterDeleted: Counter
  characterEngagement: Counter
  /**
   * Pull-based gauge for active WebSocket connections.
   *
   * Use when:
   * - Querying current concurrent WS connections in Grafana / alerts.
   *
   * Why ObservableGauge instead of UpDownCounter:
   * - UpDownCounter is delta-based (+1 / -1) and drifts when disconnect
   *   handlers miss (process crash, SIGKILL, TCP RST, network blackhole).
   * - ObservableGauge runs a callback at every export interval and reports
   *   the live registry size, so a missed -1 self-corrects on the next
   *   scrape instead of leaking forever.
   *
   * Expects:
   * - Caller (`createChatWsHandlers`) registers exactly one callback via
   *   `addCallback`. Multiple callbacks would double-count.
   */
  wsConnectionsActive: ObservableGauge
  wsMessagesSent: Counter
  wsMessagesReceived: Counter
}

export interface RevenueMetrics {
  stripeCheckoutCreated: Counter
  stripeCheckoutCompleted: Counter
  stripePaymentFailed: Counter
  stripeSubscriptionEvent: Counter
  stripeEvents: Counter
  stripeRevenue: Counter
  fluxInsufficientBalance: Counter
  fluxCredited: Counter
  fluxUnbilled: Counter
  ttsChars: Counter
  ttsPreflightRejections: Counter
}

export interface GenAiMetrics {
  operationDuration: Histogram
  operationCount: Counter
  tokenUsageInput: Counter
  tokenUsageOutput: Counter
  fluxConsumed: Counter
  firstTokenDuration: Histogram
  streamInterrupted: Counter
}

export interface EmailMetrics {
  send: Counter
  failures: Counter
  duration: Histogram
}

export interface RateLimitMetrics {
  blocked: Counter
}

// NOTICE: Database metrics (db.client.operation.duration, redis.client.command.duration) were
// intentionally removed. PgInstrumentation and IORedisInstrumentation already generate spans
// with timing for every query/command. To surface these as metrics in Grafana, configure the
// OTel Collector's spanmetrics connector to derive metrics from those spans.

export interface OtelInstance {
  sdk: NodeSDK
  http: HttpMetrics
  auth: AuthMetrics
  engagement: EngagementMetrics
  revenue: RevenueMetrics
  genAi: GenAiMetrics
  email: EmailMetrics
  rateLimit: RateLimitMetrics
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
  const samplingRatio = env.OTEL_TRACES_SAMPLING_RATIO
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
    // NOTICE: PgInstrumentation and IORedisInstrumentation are registered in
    // instrumentation.mjs (loaded via --import) so require-in-the-middle can
    // patch their CJS modules before tsx's ESM loader caches them. They only
    // emit spans (not metrics), and the trace API has a proxy that upgrades
    // a noop tracer to the real one when the SDK starts — so registering
    // early is safe for them.
    //
    // HttpInstrumentation MUST be here (NodeSDK config) and NOT in the
    // preload, because:
    // - It records `http.server.request.duration` to a Histogram instrument
    //   created against `this.meter`.
    // - The OTel metrics API does NOT have a proxy mechanism (see comment
    //   below at sdk.start()). A meter obtained before the real
    //   MeterProvider is installed becomes a permanent NoopMeter, and the
    //   histogram inside it silently swallows every record() call.
    // - NodeSDK calls setMeterProvider on its config-passed instrumentations
    //   AT start time, after the real provider is installed. That path
    //   re-runs `_updateMetricInstruments()` and gives the instrumentation
    //   a real histogram.
    // - The patch HttpInstrumentation installs is `Server.prototype.emit`
    //   (incoming) — prototype-level, race-immune. Patching at SDK-start
    //   time instead of preload time still catches every Server instance
    //   created later.
    // Source: node_modules/.../@opentelemetry+api/.../api/metrics.js
    // (`getMeterProvider()` returns NoopMeterProvider until setGlobalMeterProvider
    // is called; cached meters are not retroactively upgraded.)
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook: req => req.url === '/health',
      }),
      new RuntimeNodeInstrumentation(),
    ],
  })

  // SDK must start BEFORE metrics.getMeter() — the metrics API does NOT
  // have a proxy mechanism like traces. getMeter() called before start()
  // returns a permanent NoopMeter that never upgrades.
  sdk.start()
  logger.log(`OpenTelemetry initialized, exporting to ${otlpEndpoint}, sampling ratio: ${samplingRatio}`)

  const meter = metrics.getMeter(serviceName)

  // HTTP metrics (semconv: unit MUST be seconds)
  const http: HttpMetrics = {
    requestDuration: meter.createHistogram(METRIC_HTTP_SERVER_REQUEST_DURATION, {
      description: 'HTTP server request duration',
      unit: 's',
    }),
    activeRequests: meter.createUpDownCounter(METRIC_HTTP_SERVER_ACTIVE_REQUESTS, {
      description: 'Number of active HTTP requests',
    }),
  }

  // Auth & User metrics
  const auth: AuthMetrics = {
    attempts: meter.createCounter(METRIC_AUTH_ATTEMPTS, {
      description: 'Number of authentication attempts',
    }),
    failures: meter.createCounter(METRIC_AUTH_FAILURES, {
      description: 'Number of failed authentication attempts',
    }),
    userRegistered: meter.createCounter(METRIC_USER_REGISTERED, {
      description: 'Number of new user registrations',
    }),
    userLogin: meter.createCounter(METRIC_USER_LOGIN, {
      description: 'Number of user sign-ins',
    }),
    activeSessions: meter.createUpDownCounter(METRIC_USER_ACTIVE_SESSIONS, {
      description: 'Number of active user sessions',
    }),
  }

  // Engagement metrics
  const engagement: EngagementMetrics = {
    chatMessages: meter.createCounter(METRIC_CHAT_MESSAGES, {
      description: 'Number of chat messages written or pulled',
    }),
    characterCreated: meter.createCounter(METRIC_CHARACTER_CREATED, {
      description: 'Number of characters created',
    }),
    characterDeleted: meter.createCounter(METRIC_CHARACTER_DELETED, {
      description: 'Number of characters deleted',
    }),
    characterEngagement: meter.createCounter(METRIC_CHARACTER_ENGAGEMENT, {
      description: 'Number of character engagement actions (like/bookmark)',
    }),
    // NOTICE:
    // ObservableGauge — caller (chat-ws factory) registers a callback that
    // reads the live connection registry on each export interval. UpDownCounter
    // was previously used but drifted: missed `-1` on process crash / SIGKILL /
    // TCP RST left the counter stuck high until Prom staleness expired the
    // dead instance's series (~5 min). The pull-based gauge self-corrects on
    // the next scrape because there is no delta state to leak.
    wsConnectionsActive: meter.createObservableGauge(METRIC_WS_CONNECTIONS_ACTIVE, {
      description: 'Active WebSocket connections (live registry size, scraped per export interval)',
    }),
    wsMessagesSent: meter.createCounter(METRIC_WS_MESSAGES_SENT, {
      description: 'Messages sent via WebSocket',
    }),
    wsMessagesReceived: meter.createCounter(METRIC_WS_MESSAGES_RECEIVED, {
      description: 'Messages received via WebSocket',
    }),
  }

  // Revenue metrics
  const revenue: RevenueMetrics = {
    stripeCheckoutCreated: meter.createCounter(METRIC_STRIPE_CHECKOUT_CREATED, {
      description: 'Number of Stripe checkout sessions created',
    }),
    stripeCheckoutCompleted: meter.createCounter(METRIC_STRIPE_CHECKOUT_COMPLETED, {
      description: 'Number of Stripe checkout sessions completed',
    }),
    stripePaymentFailed: meter.createCounter(METRIC_STRIPE_PAYMENT_FAILED, {
      description: 'Number of failed Stripe payments',
    }),
    stripeSubscriptionEvent: meter.createCounter(METRIC_STRIPE_SUBSCRIPTION_EVENT, {
      description: 'Number of Stripe subscription lifecycle events',
    }),
    stripeEvents: meter.createCounter(METRIC_STRIPE_EVENTS, {
      description: 'Number of Stripe webhook events processed',
    }),
    stripeRevenue: meter.createCounter(METRIC_AIRI_STRIPE_REVENUE, {
      description: 'Stripe revenue in smallest currency unit (e.g. cents)',
      unit: 'minor_unit',
    }),
    fluxInsufficientBalance: meter.createCounter(METRIC_FLUX_INSUFFICIENT_BALANCE, {
      description: 'Number of insufficient flux balance errors',
    }),
    fluxCredited: meter.createCounter(METRIC_AIRI_FLUX_CREDITED, {
      description: 'Total flux credited to user balances, by source',
    }),
    fluxUnbilled: meter.createCounter(METRIC_AIRI_FLUX_UNBILLED, {
      description: 'Flux that should have been debited but was not (revenue leak)',
    }),
    ttsChars: meter.createCounter(METRIC_AIRI_TTS_CHARS, {
      description: 'TTS input characters processed (billing base unit)',
    }),
    ttsPreflightRejections: meter.createCounter(METRIC_AIRI_TTS_PREFLIGHT_REJECTIONS, {
      description: 'Pre-flight rejections from flux-meter assertCanAfford',
    }),
  }

  // GenAI metrics (semconv: gen_ai.client.*)
  const genAi: GenAiMetrics = {
    operationDuration: meter.createHistogram(METRIC_GEN_AI_CLIENT_OPERATION_DURATION, {
      description: 'GenAI client operation duration',
      unit: 's',
    }),
    operationCount: meter.createCounter(METRIC_GEN_AI_CLIENT_OPERATION_COUNT, {
      description: 'Number of GenAI client operations',
    }),
    tokenUsageInput: meter.createCounter(METRIC_GEN_AI_CLIENT_TOKEN_USAGE_INPUT, {
      description: 'Total input (prompt) tokens consumed',
    }),
    tokenUsageOutput: meter.createCounter(METRIC_GEN_AI_CLIENT_TOKEN_USAGE_OUTPUT, {
      description: 'Total output (completion) tokens consumed',
    }),
    fluxConsumed: meter.createCounter(METRIC_FLUX_CONSUMED, {
      description: 'Total flux consumed',
    }),
    firstTokenDuration: meter.createHistogram(METRIC_GEN_AI_CLIENT_FIRST_TOKEN_DURATION, {
      description: 'Time from request start to first streamed token (TTFB for streaming)',
      unit: 's',
    }),
    streamInterrupted: meter.createCounter(METRIC_AIRI_GEN_AI_STREAM_INTERRUPTED, {
      description: 'Streaming responses interrupted before completion',
    }),
  }

  const email: EmailMetrics = {
    send: meter.createCounter(METRIC_AIRI_EMAIL_SEND, {
      description: 'Transactional emails accepted by Resend',
    }),
    failures: meter.createCounter(METRIC_AIRI_EMAIL_FAILURES, {
      description: 'Transactional email send failures',
    }),
    duration: meter.createHistogram(METRIC_AIRI_EMAIL_DURATION, {
      description: 'Email provider call duration',
      unit: 's',
    }),
  }

  const rateLimit: RateLimitMetrics = {
    blocked: meter.createCounter(METRIC_AIRI_RATE_LIMIT_BLOCKED, {
      description: 'Requests blocked by rate limiter',
    }),
  }

  // NOTICE:
  // OTel SDK only emits a Counter time series after .add() runs the first time.
  // Without this priming step, low-traffic counters (auth_failures_total,
  // stripe_*_total, payment_failed, ...) never appear in Prometheus / Grafana
  // until an event happens — making panels look broken on fresh deploys and
  // making absence-based alerts impossible to author. add(0) registers the
  // series with a baseline of 0 without distorting any rates.
  // Removal condition: OTel SDK changes default to register Counters at create
  // time (https://github.com/open-telemetry/opentelemetry-specification/issues/2298).
  function primeCounter(counter: Counter): void {
    counter.add(0)
  }
  primeCounter(auth.attempts)
  primeCounter(auth.failures)
  primeCounter(auth.userRegistered)
  primeCounter(auth.userLogin)
  primeCounter(engagement.chatMessages)
  primeCounter(engagement.characterCreated)
  primeCounter(engagement.characterDeleted)
  primeCounter(engagement.characterEngagement)
  primeCounter(engagement.wsMessagesSent)
  primeCounter(engagement.wsMessagesReceived)
  primeCounter(revenue.stripeCheckoutCreated)
  primeCounter(revenue.stripeCheckoutCompleted)
  primeCounter(revenue.stripePaymentFailed)
  primeCounter(revenue.stripeSubscriptionEvent)
  primeCounter(revenue.stripeEvents)
  primeCounter(revenue.stripeRevenue)
  primeCounter(revenue.fluxInsufficientBalance)
  primeCounter(revenue.fluxCredited)
  primeCounter(revenue.fluxUnbilled)
  primeCounter(revenue.ttsChars)
  primeCounter(revenue.ttsPreflightRejections)
  primeCounter(genAi.operationCount)
  primeCounter(genAi.tokenUsageInput)
  primeCounter(genAi.tokenUsageOutput)
  primeCounter(genAi.fluxConsumed)
  primeCounter(genAi.streamInterrupted)
  primeCounter(email.send)
  primeCounter(email.failures)
  primeCounter(rateLimit.blocked)

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
    genAi,
    email,
    rateLimit,
    shutdown,
  }
}

const severityMap: Record<string, SeverityNumber> = {
  debug: SeverityNumber.DEBUG,
  verbose: SeverityNumber.TRACE,
  log: SeverityNumber.INFO,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
}

/**
 * Emit a log record to OpenTelemetry.
 * Automatically attaches the active span's traceId/spanId when available.
 */
export function emitOtelLog(
  level: string,
  context: string,
  message: string,
  attributes?: Record<string, string | number | boolean>,
): void {
  const otelLogger = logs.getLogger(context)
  const spanContext = trace.getActiveSpan()?.spanContext()

  otelLogger.emit({
    severityNumber: severityMap[level.toLowerCase()] ?? SeverityNumber.INFO,
    severityText: level.toUpperCase(),
    body: message,
    attributes: {
      ...attributes,
      ...(spanContext && {
        trace_id: spanContext.traceId,
        span_id: spanContext.spanId,
      }),
    },
  })
}
