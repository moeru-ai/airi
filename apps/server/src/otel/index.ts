import type { Counter, Histogram, ObservableGauge } from '@opentelemetry/api'
// NOTICE:
// HTTP server metrics (request duration, active requests) are emitted by
// `@hono/otel`'s `httpInstrumentationMiddleware` registered in `app.ts`. It
// records the standard semconv names with the matched Hono route pattern,
// so we don't create those handles here. We keep the auto HttpInstrumentation
// for OUTBOUND requests only (LLM gateway, Stripe, Resend) — see
// `instrumentation.ts`.

import type { Env } from '../libs/env'

import { useLogger } from '@guiiai/logg'
import { metrics, trace } from '@opentelemetry/api'
import { logs, SeverityNumber } from '@opentelemetry/api-logs'

import {
  METRIC_AIRI_EMAIL_DURATION,
  METRIC_AIRI_EMAIL_FAILURES,
  METRIC_AIRI_EMAIL_SEND,
  METRIC_AIRI_FLUX_CREDITED,
  METRIC_AIRI_FLUX_UNBILLED,
  METRIC_AIRI_GEN_AI_GATEWAY_CONFIG_INVALID_HMAC,
  METRIC_AIRI_GEN_AI_GATEWAY_CONFIG_RELOAD,
  METRIC_AIRI_GEN_AI_GATEWAY_CONFIG_WRITE,
  METRIC_AIRI_GEN_AI_GATEWAY_DECRYPT_FAILURES,
  METRIC_AIRI_GEN_AI_GATEWAY_FALLBACK_COUNT,
  METRIC_AIRI_GEN_AI_GATEWAY_KEY_EXHAUSTED_COUNT,
  METRIC_AIRI_GEN_AI_GATEWAY_SAME_STATUS_EXHAUSTION,
  METRIC_AIRI_GEN_AI_GATEWAY_SUBSCRIBER_STATE,
  METRIC_AIRI_GEN_AI_GATEWAY_UPSTREAM_ERRORS,
  METRIC_AIRI_GEN_AI_STREAM_INTERRUPTED,
  METRIC_AIRI_OBSERVABILITY_READ_ERRORS,
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
  METRIC_STRIPE_CHECKOUT_COMPLETED,
  METRIC_STRIPE_CHECKOUT_CREATED,
  METRIC_STRIPE_EVENTS,
  METRIC_STRIPE_PAYMENT_FAILED,
  METRIC_STRIPE_SUBSCRIPTION_EVENT,
  METRIC_USER_ACTIVE_SESSIONS,
  METRIC_USER_DISTINCT_ACTIVE,
  METRIC_USER_LOGIN,
  METRIC_USER_REGISTERED,
  METRIC_WS_CONNECTIONS_ACTIVE,
  METRIC_WS_MESSAGES_RECEIVED,
  METRIC_WS_MESSAGES_SENT,
} from '../utils/observability'

const logger = useLogger('otel')

export interface AuthMetrics {
  attempts: Counter
  failures: Counter
  userRegistered: Counter
  userLogin: Counter
  /**
   * Cluster-wide active session count, sourced from Postgres (Better Auth
   * `session` table where `expires_at > NOW()`).
   *
   * Why ObservableGauge instead of UpDownCounter:
   * - UpDownCounter drifts: TTL expiration never fires a -1, and multi-
   *   replica deploys split +1 / -1 across instances (signin on A, signout
   *   on B). The previous implementation went unboundedly positive.
   * - Reading from the source-of-truth DB at scrape time makes the metric
   *   self-correcting.
   *
   * Multi-replica note:
   * - Every replica reads the same DB and reports the same value, so the
   *   dashboard MUST aggregate with `max()` (or `avg()`), NOT `sum()`.
   *   Using sum() would multiply the real count by the replica count.
   * - See `apps/server/docs/ai-context/observability-conventions.md`,
   *   "Multi-Replica Considerations".
   */
  activeSessions: ObservableGauge
  /**
   * Pull-based gauge for distinct users with ≥1 non-expired session.
   *
   * Use when:
   * - Querying real "active users" — not session rows. Better Auth creates a
   *   new `session` row per sign-in and per OIDC token refresh, and never
   *   GCs expired rows, so {@link AuthMetrics.activeSessions} drifts up
   *   over time even when the actual user base is small.
   *
   * Expects:
   * - Backed by `SELECT COUNT(DISTINCT user_id) FROM session WHERE expires_at > now()`.
   *   Same cluster-wide truth as `activeSessions`; dashboards MUST aggregate
   *   with `avg()`, not `sum()` — see observability-conventions.md.
   */
  distinctActiveUsers: ObservableGauge
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
  /**
   * Flux value that the LLM proxy could not collect from the user. Fires from
   * both the streaming and non-streaming completion paths.
   *
   * Use when:
   * - Tracking real revenue leak in the LLM proxy.
   *
   * Labels (`reason`):
   * - `debit_failed` — `consumeFluxForLLM` threw (DB error, or `balance <= 0`
   *   after a race lost). Counter records the *full* requested amount.
   * - `partial_debit_drained` — user had `0 < balance < requested`, so we
   *   drained the balance to zero and charged what we could. Counter records
   *   `requested - charged` (the unbilled remainder only).
   *
   * Why this needs its own metric:
   * - The streaming response is already sent (HTTP 200, tokens delivered) by
   *   the time we discover we can't collect in full. DB latency / HTTP 5xx
   *   alerts do NOT fire on this path — the failure is silent at the
   *   transport layer. This counter is the only signal that ties Flux value
   *   owed to a missed debit.
   * - Recommended alert: `increase(airi_billing_flux_unbilled_total[5m]) > 0`
   *   pages on-call immediately on any sustained leak.
   */
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

export interface GatewayMetrics {
  /**
   * Per-attempt fallback event. Increments once per failing key try when the
   * router moves on to the next key/upstream. Recommended labels:
   * `provider`, `from_key`, `reason`.
   */
  fallbackCount: Counter
  /**
   * Upstream error responses received during fallback iteration. Recommended
   * labels: `provider`, `status_code`.
   */
  upstreamErrors: Counter
  /**
   * All keys (across all upstreams) failed in a single request — the user gets
   * a 5xx. Primary alert source for user-facing degradation.
   * Recommended label: `provider`.
   *
   * Recommended alert:
   *   `increase(airi_gen_ai_gateway_key_exhausted_total[5m]) > 0` → page on-call.
   */
  keyExhaustedCount: Counter
  /**
   * All keys in one request failed with the *same* upstream status code.
   * Strong signal of account-level (shared-backend) rate limiting that
   * per-key fallback cannot recover from — see plan D33 risk-acceptance
   * and the adversarial finding ADV-PLAN-006.
   * Recommended labels: `provider`, `status_code`.
   *
   * Recommended alert:
   *   `rate(airi_gen_ai_gateway_same_status_exhaustion_total[15m]) / rate(...request_count[15m]) > 0.05`
   */
  sameStatusExhaustion: Counter
  /**
   * Local in-memory configKV cache reloaded (router config). Labels: `source`
   * (`pubsub` | `ttl` | `manual`), `service_instance_id`.
   */
  configReload: Counter
  /**
   * Envelope-crypto decryption auth-tag failures. Any >0 sample indicates
   * config corruption or a master-key rotation misstep — investigate.
   * Recommended labels: `provider`, `key_entry_id`.
   */
  decryptFailures: Counter
  /**
   * Pub/Sub subscriber lifecycle transitions (`subscribed` |
   * `reconnecting` | `error` | `closed`). Watch for sustained
   * `reconnecting` — the TTL self-heal stops being ≤5s once the subscriber
   * is dead.
   */
  subscriberState: Counter
  /**
   * Admin endpoint write events for `LLM_ROUTER_CONFIG`. Labels: `result`
   * (`success` | `4xx` | `5xx`), `actor_email`. Audit-trail surrogate
   * given v1 keeps the flat-admin-role permission model (R16a known
   * limitation).
   */
  configWrite: Counter
  /**
   * Pub/Sub invalidation messages dropped because the HMAC did not verify.
   * >0 = forged or replayed message — investigate Redis access boundary.
   */
  configInvalidHmac: Counter
}

export interface EmailMetrics {
  send: Counter
  failures: Counter
  duration: Histogram
}

export interface RateLimitMetrics {
  blocked: Counter
}

export interface ObservabilityMetrics {
  /**
   * Counts failures inside metric-pipeline callbacks (e.g. a DB-backed
   * ObservableGauge that couldn't read from Postgres). Use for self-monitoring
   * — when this is rising, treat the affected gauge's reported value as
   * potentially stale.
   *
   * Labels: `metric` (the failing gauge's logical name).
   */
  metricReadErrors: Counter
}

export interface OtelInstance {
  auth: AuthMetrics
  engagement: EngagementMetrics
  revenue: RevenueMetrics
  genAi: GenAiMetrics
  gateway: GatewayMetrics
  email: EmailMetrics
  rateLimit: RateLimitMetrics
  observability: ObservabilityMetrics
}

/**
 * Build the structured metric-handle bundle used across the app.
 *
 * Use when:
 * - DI assembly in `apps/server/src/app.ts`. Returns `null` when OTel is
 *   disabled (no OTLP endpoint), so callers can skip wiring `metrics?.…`.
 *
 * Expects:
 * - `instrumentation.ts` has already started NodeSDK (loaded via
 *   `tsx --import ./instrumentation.ts`). This function does NOT start the
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
    activeSessions: meter.createObservableGauge(METRIC_USER_ACTIVE_SESSIONS, {
      description: 'Active user sessions sourced from Postgres (cluster-wide; dashboard must use avg(), not sum())',
    }),
    distinctActiveUsers: meter.createObservableGauge(METRIC_USER_DISTINCT_ACTIVE, {
      description: 'Distinct users with ≥1 non-expired session — true active-user count, immune to per-row session inflation (cluster-wide; dashboard must use avg(), not sum())',
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
      description: 'Flux owed but unbilled (post-stream debit failed). Real revenue leak.',
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

  // Router gateway metrics (in-process LLM/TTS routing — KTD-3).
  // Every counter alerts on a different failure shape; see metric-handle JSDoc
  // on GatewayMetrics for the recommended PromQL.
  const gateway: GatewayMetrics = {
    fallbackCount: meter.createCounter(METRIC_AIRI_GEN_AI_GATEWAY_FALLBACK_COUNT, {
      description: 'Per-attempt fallback events in the in-process LLM/TTS router',
    }),
    upstreamErrors: meter.createCounter(METRIC_AIRI_GEN_AI_GATEWAY_UPSTREAM_ERRORS, {
      description: 'Upstream error responses received during fallback iteration',
    }),
    keyExhaustedCount: meter.createCounter(METRIC_AIRI_GEN_AI_GATEWAY_KEY_EXHAUSTED_COUNT, {
      description: 'All keys (across all upstreams) failed in a single request — primary user-facing alert',
    }),
    sameStatusExhaustion: meter.createCounter(METRIC_AIRI_GEN_AI_GATEWAY_SAME_STATUS_EXHAUSTION, {
      description: 'All keys in one request failed with the same upstream status (account-level rate-limit signal)',
    }),
    configReload: meter.createCounter(METRIC_AIRI_GEN_AI_GATEWAY_CONFIG_RELOAD, {
      description: 'Local in-memory router config cache reloaded (by source: pubsub / ttl / manual)',
    }),
    decryptFailures: meter.createCounter(METRIC_AIRI_GEN_AI_GATEWAY_DECRYPT_FAILURES, {
      description: 'Envelope-crypto decryption auth-tag failures (config corruption or rotation misstep)',
    }),
    subscriberState: meter.createCounter(METRIC_AIRI_GEN_AI_GATEWAY_SUBSCRIBER_STATE, {
      description: 'Pub/Sub subscriber lifecycle state transitions',
    }),
    configWrite: meter.createCounter(METRIC_AIRI_GEN_AI_GATEWAY_CONFIG_WRITE, {
      description: 'Admin endpoint LLM_ROUTER_CONFIG write events (audit-trail surrogate)',
    }),
    configInvalidHmac: meter.createCounter(METRIC_AIRI_GEN_AI_GATEWAY_CONFIG_INVALID_HMAC, {
      description: 'Pub/Sub invalidation messages dropped due to HMAC mismatch (forged or replayed)',
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

  const observability: ObservabilityMetrics = {
    metricReadErrors: meter.createCounter(METRIC_AIRI_OBSERVABILITY_READ_ERRORS, {
      description: 'Failures reading metric values inside gauge callbacks',
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
    gateway.fallbackCount,
    gateway.upstreamErrors,
    gateway.keyExhaustedCount,
    gateway.sameStatusExhaustion,
    gateway.configReload,
    gateway.decryptFailures,
    gateway.subscriberState,
    gateway.configWrite,
    gateway.configInvalidHmac,
    email.send,
    email.failures,
    rateLimit.blocked,
    observability.metricReadErrors,
  ]
  for (const counter of counters) counter.add(0)

  return { auth, engagement, revenue, genAi, gateway, email, rateLimit, observability }
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
