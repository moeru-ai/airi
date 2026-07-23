// ---------------------------------------------------------------------------
// Span attribute constants (OTel semantic conventions + AIRI custom)
// ---------------------------------------------------------------------------

// GenAI semconv attributes — https://opentelemetry.io/docs/specs/semconv/gen-ai/
export const GEN_AI_ATTR_OPERATION_NAME = 'gen_ai.operation.name'
export const GEN_AI_ATTR_REQUEST_MODEL = 'gen_ai.request.model'
export const GEN_AI_ATTR_RESPONSE_MODEL = 'gen_ai.response.model'
export const GEN_AI_ATTR_SYSTEM = 'gen_ai.system'
export const GEN_AI_ATTR_USAGE_INPUT_TOKENS = 'gen_ai.usage.input_tokens'
export const GEN_AI_ATTR_USAGE_OUTPUT_TOKENS = 'gen_ai.usage.output_tokens'

// AIRI custom span attributes
export const AIRI_ATTR_BILLING_FLUX_CONSUMED = 'airi.billing.flux_consumed'
export const AIRI_ATTR_GEN_AI_INPUT_MESSAGES = 'airi.gen_ai.input.messages'
export const AIRI_ATTR_GEN_AI_INPUT_TEXT = 'airi.gen_ai.input.text'
export const AIRI_ATTR_GEN_AI_OPERATION_KIND = 'airi.gen_ai.operation.kind'
export const AIRI_ATTR_GEN_AI_OLLAMA_THINK = 'airi.gen_ai.ollama.think'
export const AIRI_ATTR_GEN_AI_OUTPUT_FULL_TEXT = 'airi.gen_ai.output.full_text'
export const AIRI_ATTR_GEN_AI_OUTPUT_TEXT = 'airi.gen_ai.output.text'
export const AIRI_ATTR_GEN_AI_STREAM = 'airi.gen_ai.stream'
export const AIRI_ATTR_GEN_AI_STREAM_INTERRUPTED = 'airi.gen_ai.stream_interrupted'

// AIRI router gateway span attributes (in-process LLM/TTS routing — KTD-3).
// All prefixed `airi.gen_ai.gateway.*` to stay under the existing `airi.gen_ai.*`
// namespace already used by `airi.gen_ai.stream_interrupted`.
export const AIRI_ATTR_GEN_AI_GATEWAY_UPSTREAM_URL = 'airi.gen_ai.gateway.upstream.url'
export const AIRI_ATTR_GEN_AI_GATEWAY_UPSTREAM_INDEX = 'airi.gen_ai.gateway.upstream.index'
export const AIRI_ATTR_GEN_AI_GATEWAY_KEY_ID = 'airi.gen_ai.gateway.key.id'
export const AIRI_ATTR_GEN_AI_GATEWAY_FALLBACK_DEPTH = 'airi.gen_ai.gateway.fallback.depth'
export const AIRI_ATTR_GEN_AI_GATEWAY_FALLBACK_REASON = 'airi.gen_ai.gateway.fallback.reason'

// Server attributes
export const SERVER_ATTR_ADDRESS = 'server.address'
export const SERVER_ATTR_PORT = 'server.port'

// ---------------------------------------------------------------------------
// Metric name constants
// ---------------------------------------------------------------------------

// HTTP — https://opentelemetry.io/docs/specs/semconv/http/http-metrics/
export const METRIC_HTTP_SERVER_REQUEST_DURATION = 'http.server.request.duration'
export const METRIC_HTTP_SERVER_ACTIVE_REQUESTS = 'http.server.active_requests'

// Auth & user (AIRI custom)
export const METRIC_AUTH_ATTEMPTS = 'auth.attempts'
export const METRIC_AUTH_FAILURES = 'auth.failures'
export const METRIC_USER_REGISTERED = 'user.registered'
export const METRIC_USER_LOGIN = 'user.login'
export const METRIC_USER_TOTAL = 'user.total'
export const METRIC_USER_ACTIVE_SESSIONS = 'user.active_sessions'
// Distinct users with at least one non-expired session row. Pair with
// USER_ACTIVE_SESSIONS to detect "session row inflation" (Better Auth
// creates a new row per sign-in / per OIDC token refresh and never GCs)
// vs real user growth.
export const METRIC_USER_DISTINCT_ACTIVE = 'user.distinct_active'
// Rolling-window distinct active users (DAU / WAU / MAU), sourced from
// `user.last_seen_at` (touched on sign-in and every OIDC token refresh).
// Single gauge, observed once per window with a `window="24h"|"7d"|"30d"`
// attribute. Unlike USER_DISTINCT_ACTIVE (live-session count) this measures
// activity over a trailing time window, not "currently signed in".
export const METRIC_USER_ACTIVE_ROLLING = 'user.active_rolling'

// Engagement (AIRI custom)
export const METRIC_CHAT_MESSAGES = 'chat.messages'
export const METRIC_CHARACTER_CREATED = 'character.created'
export const METRIC_CHARACTER_DELETED = 'character.deleted'
export const METRIC_CHARACTER_ENGAGEMENT = 'character.engagement'
export const METRIC_WS_CONNECTIONS_ACTIVE = 'ws.connections.active'
export const METRIC_WS_MESSAGES_SENT = 'ws.messages.sent'
export const METRIC_WS_MESSAGES_RECEIVED = 'ws.messages.received'

// Revenue (AIRI custom)
export const METRIC_STRIPE_CHECKOUT_CREATED = 'stripe.checkout.created'
export const METRIC_STRIPE_CHECKOUT_COMPLETED = 'stripe.checkout.completed'
export const METRIC_STRIPE_PAYMENT_FAILED = 'stripe.payment.failed'
export const METRIC_STRIPE_SUBSCRIPTION_EVENT = 'stripe.subscription.event'
export const METRIC_STRIPE_EVENTS = 'stripe.events'
export const METRIC_FLUX_INSUFFICIENT_BALANCE = 'flux.insufficient_balance'

// GenAI — https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-metrics/
export const METRIC_GEN_AI_CLIENT_OPERATION_DURATION = 'gen_ai.client.operation.duration'
export const METRIC_GEN_AI_CLIENT_OPERATION_COUNT = 'gen_ai.client.operation.count'
export const METRIC_GEN_AI_CLIENT_TOKEN_USAGE_INPUT = 'gen_ai.client.token.usage.input'
export const METRIC_GEN_AI_CLIENT_TOKEN_USAGE_OUTPUT = 'gen_ai.client.token.usage.output'
export const METRIC_FLUX_CONSUMED = 'airi.billing.flux.consumed'

// AIRI billing — credit/debit visibility beyond raw consumption
export const METRIC_AIRI_FLUX_CREDITED = 'airi.billing.flux.credited'
// Streaming-only: token already streamed to user but post-stream debit failed.
// Real revenue leak — every >0 sample should page. NOT covered by DB latency /
// HTTP 5xx alerts because the response was 2xx and the catch path is silent.
export const METRIC_AIRI_FLUX_UNBILLED = 'airi.billing.flux.unbilled'
export const METRIC_AIRI_TTS_CHARS = 'airi.billing.tts.chars'
export const METRIC_AIRI_TTS_PREFLIGHT_REJECTIONS = 'airi.billing.tts.preflight_rejections'

// AIRI observability — self-monitoring for the metric pipeline
export const METRIC_AIRI_OBSERVABILITY_READ_ERRORS = 'airi.observability.read_errors'

// Product analytics — low-cardinality event volume only. User-level product
// analytics live in Postgres `product_events`; never add user identifiers to
// this metric's labels.
export const METRIC_AIRI_PRODUCT_EVENTS = 'airi.product.events'

// AIRI revenue — actual money in (smallest currency unit, e.g. cents)
export const METRIC_AIRI_STRIPE_REVENUE = 'airi.stripe.revenue'

// AIRI email — transactional delivery health
export const METRIC_AIRI_EMAIL_SEND = 'airi.email.send'
export const METRIC_AIRI_EMAIL_FAILURES = 'airi.email.failures'
export const METRIC_AIRI_EMAIL_DURATION = 'airi.email.duration'

// AIRI rate limiting — abuse / attack visibility
export const METRIC_AIRI_RATE_LIMIT_BLOCKED = 'airi.rate_limit.blocked'

// AIRI GenAI — stream quality
export const METRIC_AIRI_GEN_AI_STREAM_INTERRUPTED = 'airi.gen_ai.stream.interrupted'
export const METRIC_GEN_AI_CLIENT_FIRST_TOKEN_DURATION = 'gen_ai.client.first_token.duration'

// AIRI router gateway — in-process LLM/TTS routing fallback / health signals.
//
// fallback_count    — each retry attempt (per failing key). Labels: provider,
//                     from_key, reason. Dashboard sum gives 24h fallback volume.
// upstream_errors   — upstream-side error responses. Labels: provider, status_code.
// key_exhausted     — all keys in a single request failed. Labels: provider.
//                     **Primary alert source for "user-facing degradation"**.
// same_status_exhaustion
//                  — all keys failed in one request *with the same status code*.
//                     Strong signal of shared-backend (account-level) rate limit
//                     that ordinary fallback can't help with. Drives D33's blind
//                     spot detection per adversarial review.
// config_reload    — local in-memory configKV cache reloaded. Labels: source
//                     (`pubsub` | `ttl` | `manual`), service_instance_id.
// decrypt_failures — envelope-crypto decryption auth-tag failures. Labels:
//                     provider, key_entry_id. >0 = config corruption or rotation
//                     misstep.
// subscriber_state — Pub/Sub subscriber lifecycle transitions. Labels: state
//                     (`subscribed` | `reconnecting` | `error` | `closed`).
// config_write     — admin endpoint write events. Labels: result
//                     (`success` | `4xx` | `5xx`), actor_email.
// config_invalid_hmac
//                  — Pub/Sub invalidation messages dropped due to HMAC mismatch
//                     (forged or replayed). >0 = investigate Redis access.
export const METRIC_AIRI_GEN_AI_GATEWAY_FALLBACK_COUNT = 'airi.gen_ai.gateway.fallback.count'
export const METRIC_AIRI_GEN_AI_GATEWAY_UPSTREAM_ERRORS = 'airi.gen_ai.gateway.upstream.errors'
export const METRIC_AIRI_GEN_AI_GATEWAY_KEY_EXHAUSTED_COUNT = 'airi.gen_ai.gateway.key.exhausted'
export const METRIC_AIRI_GEN_AI_GATEWAY_SAME_STATUS_EXHAUSTION = 'airi.gen_ai.gateway.same_status_exhaustion'
export const METRIC_AIRI_GEN_AI_GATEWAY_CONFIG_RELOAD = 'airi.gen_ai.gateway.config.reload'
export const METRIC_AIRI_GEN_AI_GATEWAY_DECRYPT_FAILURES = 'airi.gen_ai.gateway.decrypt.failures'
export const METRIC_AIRI_GEN_AI_GATEWAY_SUBSCRIBER_STATE = 'airi.gen_ai.gateway.subscriber_state'
export const METRIC_AIRI_GEN_AI_GATEWAY_CONFIG_WRITE = 'airi.gen_ai.gateway.config.write'
export const METRIC_AIRI_GEN_AI_GATEWAY_CONFIG_INVALID_HMAC = 'airi.gen_ai.gateway.config.invalid_hmac'
// TTSpool (per app_id concurrency pool) load-balancer signals.
// pool_slot_rejected — capacity-aware routing skipped a pool because its app_id
//                      was already at the concurrency cap (labels: provider, app_id).
// pool_saturation_marked
//                    — a pool was circuit-broken after exhausting with a 429
//                      (labels: provider, app_id).
// pool_inflight      — cluster-wide gauge of current in-flight requests per pool,
//                      sourced from Redis (label: app_id). Dashboard must avg(),
//                      not sum() — every replica reports the same value.
export const METRIC_AIRI_GEN_AI_GATEWAY_POOL_SLOT_REJECTED = 'airi.gen_ai.gateway.pool.slot_rejected'
export const METRIC_AIRI_GEN_AI_GATEWAY_POOL_SATURATION_MARKED = 'airi.gen_ai.gateway.pool.saturation_marked'
export const METRIC_AIRI_GEN_AI_GATEWAY_POOL_INFLIGHT = 'airi.gen_ai.gateway.pool.inflight'

// ---------------------------------------------------------------------------
// Canonical gen_ai.system values
// ---------------------------------------------------------------------------
//
// First emitter of `gen_ai.system` in this repo (see observability-conventions.md).
// Lock these values now so future adapters / providers don't fork the namespace.

export const GEN_AI_SYSTEM_OPENROUTER = 'openrouter'
export const GEN_AI_SYSTEM_AZURE_SPEECH = 'azure.speech'
export const GEN_AI_SYSTEM_DASHSCOPE_COSYVOICE = 'dashscope.cosyvoice'
export const GEN_AI_SYSTEM_VOLCENGINE_TTS = 'volcengine.tts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getServerConnectionAttributes(baseUrl: string): Record<string, string | number> {
  const url = new URL(baseUrl)
  const attributes: Record<string, string | number> = {
    [SERVER_ATTR_ADDRESS]: url.hostname,
  }

  if (url.port) {
    attributes[SERVER_ATTR_PORT] = Number.parseInt(url.port, 10)
  }

  return attributes
}
