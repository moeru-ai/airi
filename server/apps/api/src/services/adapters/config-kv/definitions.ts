import type { InferOutput } from 'valibot'

import { any, array, boolean, check, minValue, nonEmpty, number, object, optional, picklist, pipe, record, regex, string } from 'valibot'

/**
 * LLM/TTS router config tree. Single composite entry under configKV holds the
 * entire routing surface: per-model upstream list, optional candidate groups,
 * per-upstream key array (envelope-encrypted ciphertexts), transition policies,
 * and default timeouts.
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

/**
 * Explicit allow-list for one routing transition.
 *
 * Unlike {@link fallbackTriggersSchema}, this contract has no permissive
 * defaults: an omitted status or timeout never authorizes a transition across
 * a configured routing boundary.
 */
export const routeFailureTriggersSchema = object({
  httpCodes: optional(array(number()), []),
  onTimeout: optional(boolean(), false),
})

export const keyEntrySchema = object({
  id: pipe(
    string(),
    nonEmpty('keys[].id must not be empty'),
    regex(/^[^|]+$/, 'keys[].id must not contain "|" (reserved AAD separator)'),
  ),
  ciphertext: pipe(string(), nonEmpty('keys[].ciphertext must not be empty')),
})

export const llmUpstreamSchema = object({
  id: optional(pipe(
    string(),
    nonEmpty('llm.upstreams[].id must not be empty'),
    regex(/^[^|]+$/, 'llm.upstreams[].id must not contain "|"'),
  )),
  baseURL: pipe(string(), nonEmpty('llm.upstreams[].baseURL must not be empty')),
  overrideModel: optional(string()),
  keys: pipe(array(keyEntrySchema), check(v => v.length >= 1, 'llm.upstreams[].keys must contain at least 1 entry')),
  headerTemplate: optional(string(), 'Bearer {KEY}'),
  timeoutMs: optional(number()),
})

export const llmRoutingGroupSchema = object({
  id: pipe(string(), nonEmpty('llm.routing.groups[].id must not be empty')),
  upstreamIds: pipe(
    array(pipe(string(), nonEmpty('llm.routing.groups[].upstreamIds[] must not be empty'))),
    check(v => v.length >= 1, 'llm.routing.groups[].upstreamIds must contain at least 1 entry'),
    check(v => new Set(v).size === v.length, 'llm.routing.groups[].upstreamIds must be unique'),
  ),
  retryOn: routeFailureTriggersSchema,
  continueOn: optional(routeFailureTriggersSchema),
})

export const llmRoutingSchema = object({
  groups: pipe(
    array(llmRoutingGroupSchema),
    check(v => v.length >= 1, 'llm.routing.groups must contain at least 1 entry'),
    check(v => new Set(v.map(group => group.id)).size === v.length, 'llm.routing.groups[].id must be unique'),
  ),
})

export const llmModelSchema = pipe(
  object({
    upstreams: pipe(array(llmUpstreamSchema), check(v => v.length >= 1, 'llm.models[].upstreams must contain at least 1 entry')),
    routing: optional(llmRoutingSchema),
    fallbackTriggers: fallbackTriggersSchema,
  }),
  check((model) => {
    if (model.routing == null)
      return true
    const upstreamIds = model.upstreams.map(upstream => upstream.id)
    return upstreamIds.every(id => id != null)
      && new Set(upstreamIds).size === upstreamIds.length
  }, 'llm.models[].upstreams must have unique ids when routing is configured'),
  check((model) => {
    if (model.routing == null)
      return true
    const upstreamIds = new Set(model.upstreams.map(upstream => upstream.id))
    const referencedIds = model.routing.groups.flatMap(group => group.upstreamIds)
    return referencedIds.length === upstreamIds.size
      && new Set(referencedIds).size === referencedIds.length
      && referencedIds.every(id => upstreamIds.has(id))
  }, 'llm.routing.groups must reference every upstream id exactly once'),
)

const ttsProviderSchema = picklist(['azure', 'dashscope-cosyvoice', 'stepfun', 'volcengine'])
const asrProviderSchema = picklist(['aliyun-nls'])

export const ttsUpstreamSchema = object({
  id: optional(pipe(
    string(),
    nonEmpty('tts.upstreams[].id must not be empty'),
    regex(/^[^|]+$/, 'tts.upstreams[].id must not contain "|"'),
  )),
  baseURL: pipe(string(), nonEmpty('tts.upstreams[].baseURL must not be empty')),
  keys: pipe(array(keyEntrySchema), check(v => v.length >= 1, 'tts.upstreams[].keys must contain at least 1 entry')),
  adapterParams: optional(record(string(), any()), {}),
  // Per-app_id concurrency cap for the pool load balancer. One upstream maps to
  // one app_id (Volcengine `adapterParams.appid`), capped by the provider at a
  // small number (e.g. 10). When set on any upstream of a model, the router
  // switches from fixed-order fallback to capacity-aware routing across pools.
  // Absent = unlimited: that model keeps the original fixed-order behavior and
  // makes zero Redis calls (no regression for existing single-app configs).
  maxConcurrency: optional(pipe(number(), check(v => v >= 1, 'tts.upstreams[].maxConcurrency must be >= 1 when set'))),
})

export const ttsRoutingGroupSchema = object({
  id: pipe(string(), nonEmpty('tts.routing.groups[].id must not be empty')),
  upstreamIds: pipe(
    array(pipe(string(), nonEmpty('tts.routing.groups[].upstreamIds[] must not be empty'))),
    check(v => v.length >= 1, 'tts.routing.groups[].upstreamIds must contain at least 1 entry'),
    check(v => new Set(v).size === v.length, 'tts.routing.groups[].upstreamIds must be unique'),
  ),
  strategy: optional(picklist(['ordered', 'least-inflight']), 'ordered'),
  retryOn: routeFailureTriggersSchema,
  continueOn: optional(routeFailureTriggersSchema),
})

export const ttsRoutingSchema = object({
  groups: pipe(
    array(ttsRoutingGroupSchema),
    check(v => v.length >= 1, 'tts.routing.groups must contain at least 1 entry'),
    check(v => new Set(v.map(group => group.id)).size === v.length, 'tts.routing.groups[].id must be unique'),
  ),
})

export const streamingTtsUpstreamSchema = object({
  baseURL: pipe(string(), nonEmpty('UNSPEECH_UPSTREAM.streaming.baseURL must not be empty')),
  keys: pipe(array(keyEntrySchema), check(v => v.length >= 1, 'UNSPEECH_UPSTREAM.streaming.keys must contain at least 1 entry')),
  adapterParams: optional(record(string(), any()), {}),
  models: optional(
    array(object({
      id: pipe(string(), nonEmpty('UNSPEECH_UPSTREAM.streaming.models[].id must not be empty')),
      name: optional(string()),
      description: optional(string()),
    })),
    [],
  ),
  defaultModel: optional(string()),
})

export const unspeechUpstreamSchema = object({
  restBaseURL: pipe(string(), nonEmpty('UNSPEECH_UPSTREAM.restBaseURL must not be empty')),
  streaming: optional(streamingTtsUpstreamSchema),
})

export const ttsModelSchema = pipe(
  object({
    provider: ttsProviderSchema,
    upstreams: pipe(array(ttsUpstreamSchema), check(v => v.length >= 1, 'tts.models[].upstreams must contain at least 1 entry')),
    routing: optional(ttsRoutingSchema),
    fallbackTriggers: fallbackTriggersSchema,
  }),
  check((model) => {
    if (model.routing == null)
      return true
    const upstreamIds = model.upstreams.map(upstream => upstream.id)
    return upstreamIds.every(id => id != null)
      && new Set(upstreamIds).size === upstreamIds.length
  }, 'tts.models[].upstreams must have unique ids when routing is configured'),
  check((model) => {
    if (model.routing == null)
      return true
    const upstreamIds = new Set(model.upstreams.map(upstream => upstream.id))
    const referencedIds = model.routing.groups.flatMap(group => group.upstreamIds)
    return referencedIds.length === upstreamIds.size
      && new Set(referencedIds).size === referencedIds.length
      && referencedIds.every(id => upstreamIds.has(id))
  }, 'tts.routing.groups must reference every upstream id exactly once'),
  check((model) => {
    if (model.routing == null)
      return true
    const upstreamById = new Map(model.upstreams.map(upstream => [upstream.id, upstream]))
    return model.routing.groups.every(group =>
      group.strategy !== 'least-inflight'
      || group.upstreamIds.every(id => upstreamById.get(id)?.maxConcurrency != null),
    )
  }, 'tts.routing least-inflight groups require maxConcurrency on every upstream'),
)

export const asrUpstreamSchema = object({
  keys: pipe(array(keyEntrySchema), check(v => v.length >= 1, 'asr.upstreams[].keys must contain at least 1 entry')),
  adapterParams: optional(record(string(), any()), {}),
})

export const asrModelSchema = object({
  provider: asrProviderSchema,
  upstreams: pipe(array(asrUpstreamSchema), check(v => v.length >= 1, 'asr.models[].upstreams must contain at least 1 entry')),
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
  asr: optional(object({
    models: record(string(), asrModelSchema),
  })),
  defaults: llmRouterDefaultsSchema,
})

/**
 * Config entry schemas are the single source of truth for:
 * - runtime validation
 * - default values
 * - stored JSON shape
 */
export const configEntrySchemas = {
  FLUX_PER_REQUEST: optional(number(), 5),
  INITIAL_USER_FLUX: optional(number(), 0),
  FLUX_PER_1K_TOKENS: optional(number(), 1),
  FLUX_PER_1K_CHARS_TTS: number(),
  // Debt-ledger TTL: residual TTS chars below 1 Flux are forgiven on expiry.
  // 24h gives users a long-enough window for accumulated dust to settle naturally.
  TTS_DEBT_TTL_SECONDS: optional(number(), 86400),
  // One-time Flux packs. Display prices are preformatted strings keyed by
  // currency. Provider ids map each pack onto Stripe (and later Apple/Steam).
  FLUX_PACKS: optional(array(object({
    key: pipe(string(), nonEmpty('FLUX_PACKS[].key must not be empty')),
    name: pipe(string(), nonEmpty('FLUX_PACKS[].name must not be empty')),
    fluxAmount: pipe(number(), minValue(1, 'FLUX_PACKS[].fluxAmount must be >= 1')),
    recommended: optional(boolean(), false),
    providers: optional(object({
      stripe: optional(object({
        priceId: pipe(string(), nonEmpty('FLUX_PACKS[].providers.stripe.priceId must not be empty')),
      })),
    }), {}),
  })), []),
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
  // so deployment configuration must populate it before traffic flows.
  LLM_ROUTER_CONFIG: optional(llmRouterConfigSchema),
  // Single unspeech deployment used for every TTS surface: REST audio/speech,
  // REST voices catalog, ws audio/speech/stream. `streaming` is optional —
  // operator may run REST-only without the ws upstream. `streaming.keys`
  // carry the upstream-provider API key (Volcengine X-Api-Key), not an
  // unspeech tenant token (unspeech itself is unauthenticated).
  UNSPEECH_UPSTREAM: optional(unspeechUpstreamSchema),
} as const

export type ConfigDefinitions = {
  [K in keyof typeof configEntrySchemas]: InferOutput<(typeof configEntrySchemas)[K]>
}

export type ConfigKey = keyof ConfigDefinitions
