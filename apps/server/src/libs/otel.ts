import type { Counter, Histogram, ObservableGauge, UpDownCounter } from '@opentelemetry/api'

import type { Env } from './env'

import { useLogger } from '@guiiai/logg'
import { metrics, trace } from '@opentelemetry/api'
import { logs, SeverityNumber } from '@opentelemetry/api-logs'

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

export interface OtelInstance {
  http: HttpMetrics
  auth: AuthMetrics
  engagement: EngagementMetrics
  revenue: RevenueMetrics
  genAi: GenAiMetrics
  email: EmailMetrics
  rateLimit: RateLimitMetrics
}

/**
 * Build the structured metric-handle bundle used across the app.
 *
 * Use when:
 * - DI assembly in `apps/server/src/app.ts`. Returns `null` when OTel is
 *   disabled (no OTLP endpoint), so callers can skip wiring `metrics?.…`.
 *
 * Expects:
 * - `instrumentation.mjs` has already started NodeSDK (loaded via
 *   `tsx --import ./instrumentation.mjs`). This function does NOT start the
 *   SDK — it only consumes the global MeterProvider that the preload set up.
 *   Calling it before the preload runs would yield NoopMeter for everything.
 *
 * Returns:
 * - Metric bundle with primed counters (so low-traffic series show up in
 *   Prometheus from boot), or `null` when OTel is disabled.
 */
export function initOtel(env: Env): OtelInstance | null {
  if (!env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    logger.log('OpenTelemetry disabled (set OTEL_EXPORTER_OTLP_ENDPOINT to enable)')
    return null
  }

  const meter = metrics.getMeter(env.OTEL_SERVICE_NAME)

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
  const counters = [
    auth.attempts,
    auth.failures,
    auth.userRegistered,
    auth.userLogin,
    engagement.chatMessages,
    engagement.characterCreated,
    engagement.characterDeleted,
    engagement.characterEngagement,
    engagement.wsMessagesSent,
    engagement.wsMessagesReceived,
    revenue.stripeCheckoutCreated,
    revenue.stripeCheckoutCompleted,
    revenue.stripePaymentFailed,
    revenue.stripeSubscriptionEvent,
    revenue.stripeEvents,
    revenue.stripeRevenue,
    revenue.fluxInsufficientBalance,
    revenue.fluxCredited,
    revenue.fluxUnbilled,
    revenue.ttsChars,
    revenue.ttsPreflightRejections,
    genAi.operationCount,
    genAi.tokenUsageInput,
    genAi.tokenUsageOutput,
    genAi.fluxConsumed,
    genAi.streamInterrupted,
    email.send,
    email.failures,
    rateLimit.blocked,
  ]
  for (const counter of counters) counter.add(0)

  return { http, auth, engagement, revenue, genAi, email, rateLimit }
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
