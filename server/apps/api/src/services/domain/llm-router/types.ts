import type { InferOutput } from 'valibot'

// NOTICE:
// The Valibot schemas in `services/adapters/config-kv/definitions.ts` are the single source of
// truth for the router config tree. We re-export inferred types so downstream
// modules don't redeclare the shape. New fields belong in that file, not
// here.
// Source: server/apps/api/src/services/adapters/config-kv/definitions.ts (llmRouterConfigSchema).
import type {
  asrModelSchema,
  asrUpstreamSchema,
  fallbackTriggersSchema,
  keyEntrySchema,
  llmModelSchema,
  llmRouterConfigSchema,
  llmRouterDefaultsSchema,
  llmRoutingGroupSchema,
  llmRoutingSchema,
  llmUpstreamSchema,
  routeFailureTriggersSchema,
  ttsModelSchema,
  ttsRoutingGroupSchema,
  ttsRoutingSchema,
  ttsUpstreamSchema,
} from '../../adapters/config-kv'

/**
 * ASR model entry — provider tag + ordered upstreams for realtime transcription.
 */
export type AsrModel = InferOutput<typeof asrModelSchema>

/**
 * ASR upstream — one provider credential set plus adapter params.
 */
export type AsrUpstream = InferOutput<typeof asrUpstreamSchema>

/**
 * Per-(upstream) fallback trigger config: which upstream HTTP codes should
 * cause the router to move on to the next key/upstream.
 */
export type FallbackTriggers = InferOutput<typeof fallbackTriggersSchema>

/**
 * One entry in `upstream.keys`: stable id + at-rest envelope ciphertext.
 * The plaintext key is only produced lazily by the key-rotator at call time.
 */
export type KeyEntry = InferOutput<typeof keyEntrySchema>

/**
 * LLM model entry — upstream candidates plus an optional grouped route.
 */
export type LlmModel = InferOutput<typeof llmModelSchema>

/**
 * Auxiliary context shape kept alongside one `route()` invocation. Not part
 * of the public input — exists so future billing-attribution work can thread
 * userId / billing tags through without changing the call signature.
 *
 * Per SEC-5: upstream response bodies must never enter this shape. Only
 * status codes (or `'timeout'`) and counts are safe to carry.
 */
export interface LlmRouteContext {
  /** Most recent upstream failure status or `'timeout'`. */
  lastStatus: 'timeout' | null | number
  /** Provider tag for OTel labels (e.g. `openrouter`). */
  provider: string
  /** Number of keys attempted across all upstreams so far. */
  triedKeys: number
  /** Number of upstreams attempted so far. */
  triedUpstreams: number
  /** Actual model id sent to the winning upstream after `overrideModel` rewrites. */
  upstreamModel?: string
}

/**
 * A single inbound request the router knows how to dispatch.
 *
 * The body is **already-parsed JSON** (not a Buffer). The router clones it
 * per attempt and injects `model` + the auth header before forwarding to the
 * chosen upstream.
 */
export interface LlmRouteRequest {
  /**
   * Caller-side abort signal (typically the client disconnect signal). When
   * fired mid-flight, the active upstream fetch is aborted and the router
   * stops without trying further keys/upstreams.
   */
  abortSignal?: AbortSignal
  /** Already-parsed JSON body (OpenAI-shaped chat-completions payload). */
  body: Record<string, unknown>
  /**
   * Caller-supplied headers to forward. The router overwrites `authorization`
   * and `content-type`; everything else passes through.
   */
  headers?: Record<string, string>
  /**
   * Model name from the caller (e.g. `openai/gpt-5-mini`). Used to look up
   * the per-model upstream list in `LLM_ROUTER_CONFIG`.
   */
  modelName: string
}

/**
 * LLM route composed from ordered candidate groups.
 */
export type LlmRouting = InferOutput<typeof llmRoutingSchema>

/**
 * One ordered group of interchangeable LLM candidates.
 */
export type LlmRoutingGroup = InferOutput<typeof llmRoutingGroupSchema>

/**
 * LLM upstream — one candidate endpoint with its ordered key list.
 */
export type LlmUpstream = InferOutput<typeof llmUpstreamSchema>

/**
 * Which surface the router orchestrates for a given route call.
 */
export type ModelKind = 'llm' | 'tts'

/**
 * Failure allow-list that authorizes a routing transition.
 */
export type RouteFailureTriggers = InferOutput<typeof routeFailureTriggersSchema>

/**
 * Composite router config (the value at `LLM_ROUTER_CONFIG` in configKV).
 */
export type RouterConfig = InferOutput<typeof llmRouterConfigSchema>

/**
 * Top-level routing defaults (per-attempt + full-chain timeouts and
 * fallback HTTP codes).
 */
export type RouterDefaults = InferOutput<typeof llmRouterDefaultsSchema>

/**
 * TTS model entry — provider tag, upstream candidates, and optional grouped route.
 */
export type TtsModel = InferOutput<typeof ttsModelSchema>

/**
 * TTS route composed from ordered candidate groups.
 */
export type TtsRouting = InferOutput<typeof ttsRoutingSchema>

/**
 * One group of interchangeable TTS candidates.
 */
export type TtsRoutingGroup = InferOutput<typeof ttsRoutingGroupSchema>

/**
 * TTS upstream — one candidate endpoint with adapter params + key list.
 */
export type TtsUpstream = InferOutput<typeof ttsUpstreamSchema>
