// ---------------------------------------------------------------------------
// Span attribute constants (OTel semantic conventions + AIRI custom)
// ---------------------------------------------------------------------------

// GenAI semconv attributes — https://opentelemetry.io/docs/specs/semconv/gen-ai/
export const GEN_AI_ATTR_OPERATION_NAME = 'gen_ai.operation.name'
export const GEN_AI_ATTR_REQUEST_MODEL = 'gen_ai.request.model'
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
export const METRIC_USER_ACTIVE_SESSIONS = 'user.active_sessions'

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
