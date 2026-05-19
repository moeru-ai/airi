import type Redis from 'ioredis'
import type { InferOutput } from 'valibot'

import { any, array, boolean, check, nonEmpty, number, object, optional, parse, picklist, pipe, record, regex, string } from 'valibot'

import { createServiceUnavailableError } from '../../utils/error'
import { configRedisKey } from '../../utils/redis-keys'

/**
 * LLM/TTS router config tree. Single composite entry under configKV holds the
 * entire routing surface: per-model upstream list, per-upstream key array
 * (envelope-encrypted ciphertexts), fallback triggers, default timeouts.
 *
 * Schema enforces:
 * - key entry id must not contain `|` — the envelope-crypto AAD uses `|` as
 *   a reserved separator between `modelName` and `keyEntryId`.
 * - keys array is non-empty per upstream (an upstream with zero keys can
 *   never serve a request and is almost certainly an admin mistake).
 *
 * Defaults at this layer apply when the admin omits the `defaults` object;
 * the router service is responsible for surfacing CONFIG_NOT_SET when the
 * whole `LLM_ROUTER_CONFIG` entry is absent.
 */
export const fallbackTriggersSchema = optional(
  object({
    httpCodes: optional(array(number()), [401, 402, 403, 429, 500, 502, 503, 504]),
    onTimeout: optional(boolean(), true),
  }),
  { httpCodes: [401, 402, 403, 429, 500, 502, 503, 504], onTimeout: true },
)

export const keyEntrySchema = object({
  id: pipe(
    string(),
    nonEmpty('keys[].id must not be empty'),
    regex(/^[^|]+$/, 'keys[].id must not contain "|" (reserved AAD separator)'),
  ),
  ciphertext: pipe(string(), nonEmpty('keys[].ciphertext must not be empty')),
})

export const llmUpstreamSchema = object({
  baseURL: pipe(string(), nonEmpty('llm.upstreams[].baseURL must not be empty')),
  overrideModel: optional(string()),
  keys: pipe(array(keyEntrySchema), check(v => v.length >= 1, 'llm.upstreams[].keys must contain at least 1 entry')),
  headerTemplate: optional(string(), 'Bearer {KEY}'),
  timeoutMs: optional(number()),
})

export const llmModelSchema = object({
  upstreams: pipe(array(llmUpstreamSchema), check(v => v.length >= 1, 'llm.models[].upstreams must contain at least 1 entry')),
  fallbackTriggers: fallbackTriggersSchema,
})

const ttsProviderSchema = picklist(['azure', 'dashscope-cosyvoice', 'volcengine'])

export const ttsUpstreamSchema = object({
  baseURL: pipe(string(), nonEmpty('tts.upstreams[].baseURL must not be empty')),
  keys: pipe(array(keyEntrySchema), check(v => v.length >= 1, 'tts.upstreams[].keys must contain at least 1 entry')),
  adapterParams: optional(record(string(), any()), {}),
})

export const ttsModelSchema = object({
  provider: ttsProviderSchema,
  upstreams: pipe(array(ttsUpstreamSchema), check(v => v.length >= 1, 'tts.models[].upstreams must contain at least 1 entry')),
  fallbackTriggers: fallbackTriggersSchema,
})

export const llmRouterDefaultsSchema = optional(
  object({
    perAttemptTimeoutMs: optional(number(), 30000),
    fullChainTimeoutMs: optional(number(), 60000),
    fallbackHttpCodes: optional(array(number()), [401, 402, 403, 429, 500, 502, 503, 504]),
  }),
  { perAttemptTimeoutMs: 30000, fullChainTimeoutMs: 60000, fallbackHttpCodes: [401, 402, 403, 429, 500, 502, 503, 504] },
)

export const llmRouterConfigSchema = object({
  llm: object({
    models: record(string(), llmModelSchema),
  }),
  tts: object({
    models: record(string(), ttsModelSchema),
  }),
  defaults: llmRouterDefaultsSchema,
})

/**
 * Config entry schemas are the single source of truth for:
 * - runtime validation
 * - default values
 * - Redis serialization/deserialization shape
 */
const ConfigEntrySchemas = {
  FLUX_PER_REQUEST: optional(number(), 5),
  INITIAL_USER_FLUX: optional(number(), 0),
  FLUX_PER_1K_TOKENS: optional(number(), 1),
  FLUX_PER_1K_CHARS_TTS: number(),
  // Debt-ledger TTL: residual TTS chars below 1 Flux are forgiven on expiry.
  // 24h gives users a long-enough window for accumulated dust to settle naturally.
  TTS_DEBT_TTL_SECONDS: optional(number(), 86400),
  AUTH_RATE_LIMIT_MAX: optional(number(), 20),
  AUTH_RATE_LIMIT_WINDOW_SEC: optional(number(), 60),
  // No default — absent means top-up is not available yet
  STRIPE_FLUX_PRODUCT_ID: optional(string()),
  // No default — absent lets Stripe auto-select payment methods via Dashboard config
  STRIPE_PAYMENT_METHODS: optional(array(string())),
  STRIPE_PAYMENT_METHOD_OPTIONS: optional(record(string(), any()), {}),
  // model id → (BCP-47 locale → recommended voice id). Outer key is either a
  // router TTS model id (LLM_ROUTER_CONFIG.tts.models key) for REST or a
  // streaming api_resource_id (e.g. `seed-tts-2.0`) for the streaming surface.
  // The two key spaces do not overlap. Consumed by the client to preselect a
  // voice matching UI locale per active model.
  DEFAULT_TTS_VOICES: optional(record(string(), record(string(), string())), {}),
  // Server-side alias resolution for `model: 'auto'` in /chat/completions and
  // /audio/speech. The modelName written here must exist as a key in
  // LLM_ROUTER_CONFIG.{llm,tts}.models — the router itself doesn't understand
  // `auto`, this layer translates before dispatch. No default: missing entry
  // surfaces CONFIG_NOT_SET (resolveWithDefault swallows ValiError) so a
  // misconfigured deploy fails the request instead of silently routing to an
  // empty modelName. Naked schema (not wrapped in optional) keeps the inferred
  // type tight (`string` rather than `string | undefined`) for call sites.
  DEFAULT_CHAT_MODEL: pipe(string(), nonEmpty('DEFAULT_CHAT_MODEL must not be empty')),
  DEFAULT_TTS_MODEL: pipe(string(), nonEmpty('DEFAULT_TTS_MODEL must not be empty')),
  // No default — the router throws CONFIG_NOT_SET when this entry is absent
  // so the admin endpoint (U9) is forced to populate it before traffic flows.
  LLM_ROUTER_CONFIG: optional(llmRouterConfigSchema),
  // Streaming TTS upstream — a single unspeech instance that the
  // /api/v1/audio/speech/ws proxy connects to. Separate from
  // LLM_ROUTER_CONFIG.tts.models because the streaming surface has different
  // semantics from one-shot HTTP TTS: ws-to-ws bridging, no per-attempt retry
  // (a live ws cannot transparently switch upstream mid-session), upstream
  // does the protocol translation to providers (Volcengine v3 etc.). Reuses
  // ttsUpstreamSchema only for the key envelope shape — `keys` carry the
  // upstream-provider API key (e.g. Volcengine X-Api-Key), not an unspeech
  // tenant token.
  STREAMING_TTS_UPSTREAM: optional(ttsUpstreamSchema),
} as const

type ConfigDefinitions = {
  [K in keyof typeof ConfigEntrySchemas]: InferOutput<(typeof ConfigEntrySchemas)[K]>
}

type ConfigKey = keyof ConfigDefinitions

function parseValue<K extends ConfigKey>(key: K, raw: string): ConfigDefinitions[K] {
  return parse(ConfigEntrySchemas[key], JSON.parse(raw)) as ConfigDefinitions[K]
}

function serializeValue<K extends ConfigKey>(key: K, value: ConfigDefinitions[K]): string {
  return JSON.stringify(parse(ConfigEntrySchemas[key], value))
}

/**
 * Resolve a config value: read from Redis, then apply valibot default if missing.
 * Returns `undefined` if both Redis and schema have no value (required key, not set).
 */
function resolveWithDefault<K extends ConfigKey>(key: K, raw: string | null): ConfigDefinitions[K] | undefined {
  if (raw !== null)
    return parseValue(key, raw)

  // Use the per-key schema with `undefined` to trigger the key default
  try {
    return parse(ConfigEntrySchemas[key], undefined) as ConfigDefinitions[K]
  }
  catch {
    return undefined
  }
}

export function createConfigKVService(redis: Redis) {
  return {
    async getOptional<K extends ConfigKey>(key: K): Promise<ConfigDefinitions[K] | null> {
      const raw = await redis.get(configRedisKey(key))
      const value = resolveWithDefault(key, raw)
      return value ?? null
    },

    async getOrThrow<K extends ConfigKey>(key: K): Promise<ConfigDefinitions[K]> {
      const raw = await redis.get(configRedisKey(key))
      const value = resolveWithDefault(key, raw)
      if (value === undefined)
        throw createServiceUnavailableError('Service configuration is incomplete', 'CONFIG_NOT_SET')

      return value
    },

    async get<K extends ConfigKey>(key: K): Promise<ConfigDefinitions[K]> {
      return this.getOrThrow(key)
    },

    async set<K extends ConfigKey>(key: K, value: ConfigDefinitions[K]): Promise<void> {
      const serialized = serializeValue(key, value)
      await redis.set(configRedisKey(key), serialized)
    },
  }
}

export type ConfigKVService = ReturnType<typeof createConfigKVService>
