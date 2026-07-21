import type { InferOutput } from 'valibot'

// NOTICE:
// The Valibot schemas in `services/config-kv.ts` are the single source of
// truth for the router config tree. We re-export inferred types so downstream
// modules don't redeclare the shape. New fields belong in config-kv.ts, not
// here.
// Source: apps/server/src/services/config-kv.ts (llmRouterConfigSchema).
import type {
  asrModelSchema,
  asrUpstreamSchema,
  fallbackTriggersSchema,
  keyEntrySchema,
  llmModelSchema,
  llmRouterConfigSchema,
  llmRouterDefaultsSchema,
  llmUpstreamSchema,
  ttsModelSchema,
  ttsUpstreamSchema,
} from '../../adapters/config-kv'

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
 * LLM upstream — one provider endpoint with its ordered key list.
 */
export type LlmUpstream = InferOutput<typeof llmUpstreamSchema>

/**
 * LLM model entry — ordered list of upstreams to try in fallback order.
 */
export type LlmModel = InferOutput<typeof llmModelSchema>

/**
 * TTS upstream — one provider endpoint with adapter params + key list.
 */
export type TtsUpstream = InferOutput<typeof ttsUpstreamSchema>

/**
 * TTS model entry — provider tag + ordered upstreams.
 */
export type TtsModel = InferOutput<typeof ttsModelSchema>

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
 * Which surface the router orchestrates for a given route call.
 */
export type ModelKind = 'llm' | 'tts'

/**
 * A single inbound request the router knows how to dispatch.
 *
 * The body is **already-parsed JSON** (not a Buffer). The router clones it
 * per attempt and injects `model` + the auth header before forwarding to the
 * chosen upstream.
 */
export interface LlmRouteRequest {
  /**
   * Model name from the caller (e.g. `openai/gpt-5-mini`). Used to look up
   * the per-model upstream list in `LLM_ROUTER_CONFIG`.
   */
  modelName: string
  /** Already-parsed JSON body (OpenAI-shaped chat-completions payload). */
  body: Record<string, unknown>
  /**
   * Caller-supplied headers to forward. The router overwrites `authorization`
   * and `content-type`; everything else passes through.
   */
  headers?: Record<string, string>
  /**
   * Caller-side abort signal (typically the client disconnect signal). When
   * fired mid-flight, the active upstream fetch is aborted and the router
   * stops without trying further keys/upstreams.
   */
  abortSignal?: AbortSignal
}

/**
 * Auxiliary context shape kept alongside one `route()` invocation. Not part
 * of the public input — exists so future billing-attribution work can thread
 * userId / billing tags through without changing the call signature.
 *
 * Per SEC-5: upstream response bodies must never enter this shape. Only
 * status codes (or `'timeout'`) and counts are safe to carry.
 */
export interface LlmRouteContext {
  /** Provider tag for OTel labels (e.g. `openrouter`). */
  provider: string
  /** Actual model id sent to the winning upstream after `overrideModel` rewrites. */
  upstreamModel?: string
  /** Number of upstreams attempted so far. */
  triedUpstreams: number
  /** Number of keys attempted across all upstreams so far. */
  triedKeys: number
  /** Most recent upstream failure status or `'timeout'`. */
  lastStatus: number | 'timeout' | null
}
