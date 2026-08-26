import type { Buffer } from 'node:buffer'

import type { Voice } from 'unspeech'

/**
 * Pure protocol translator between OpenAI-shaped `/v1/audio/speech` requests
 * and one upstream TTS provider.
 *
 * Use when:
 * - Routing a hosted TTS request through the gateway.
 * - Listing supported voices for a provider via {@link getVoiceCatalog}.
 *
 * Expects:
 * - {@link TtsAdapterContext.fetchImpl} is wired by the caller.
 * - {@link TtsAdapterContext.keyPlaintext} has already been decrypted from the
 *   key entry — adapters never touch envelope ciphertext.
 *
 * Returns:
 * - A {@link TtsResult} on 2xx upstream responses.
 * - Throws (Error subclass) on upstream non-2xx — the router maps the error to
 *   the next fallback key/upstream or to a 5xx for the caller. Adapters MUST
 *   NOT swallow upstream failures.
 */
export interface TtsAdapter {
  /**
   * Returns the voice catalog for the provider.
   *
   * Live providers (Azure) call upstream through unspeech using the supplied
   * region + plaintext key. Static provider catalogs are also owned and served
   * by unspeech. Adapters MUST throw on upstream failure — no empty fallback.
   */
  getVoiceCatalog: (ctx: TtsVoiceCatalogContext) => Promise<Voice[]>
  /** Stable id used by the registry and config (`tts.upstreams[i].adapter`). */
  id: TtsAdapterId
  /** Dispatches one TTS request and resolves with the audio payload. */
  send: (input: TtsInput, ctx: TtsAdapterContext) => Promise<TtsResult>
}

/**
 * Per-call context carrying the resolved key, upstream wiring, and abort
 * plumbing. The router builds this before delegating to {@link TtsAdapter.send}.
 *
 * The plaintext key is held in a Node Buffer so callers can zero/scrub it on
 * exit; adapters MUST NOT log or persist it.
 */
export interface TtsAdapterContext {
  /** Caller-side abort signal — propagated to the upstream fetch. */
  abortSignal?: AbortSignal
  /** Free-form adapter-specific params from `tts.upstreams[i].adapterParams` (e.g. Volcengine `appid` / `cluster`). */
  adapterParams: Record<string, unknown>
  /**
   * Per-upstream baseURL from `LLM_ROUTER_CONFIG.tts.upstreams[i].baseURL`.
   *
   * Adapters forward through unspeech and may use this as provider metadata.
   * Provider endpoint selection belongs to unspeech, not this URL.
   */
  baseURL: string
  /** Fetch implementation. Tests inject a `vi.fn()`; production passes `globalThis.fetch`. */
  fetchImpl: typeof fetch
  /** Decrypted upstream credential. Plain text — keep in-memory only. */
  keyPlaintext: Buffer
  /** unspeech REST base URL (no trailing slash). */
  unspeechBaseURL: string
}

/**
 * Stable provider identifier for the v1 adapter registry.
 *
 * Adding a new adapter means adding a new id here AND registering it in
 * `./index.ts` — the union is intentionally tight so unknown ids fail at the
 * type level (router config validation handles runtime).
 */
export type TtsAdapterId = 'azure' | 'dashscope-cosyvoice' | 'stepfun' | 'volcengine'

/**
 * Inbound TTS request shape passed to every adapter.
 *
 * Adapters translate this provider-neutral payload into the
 * provider's native protocol body (Azure SSML, DashScope JSON,
 * Volcengine JSON, etc.).
 */
export interface TtsInput {
  /**
   * Adapter-specific escape hatch for niche flags that aren't worth promoting
   * to the canonical shape (e.g. Azure's `disableSsml`, future per-call quirks).
   */
  extraOptions?: Record<string, unknown>
  /** Provider format key (e.g. `mp3`, `wav`, Azure-specific `audio-24khz-48kbitrate-mono-mp3`). */
  responseFormat?: string
  /**
   * Speech rate multiplier. `1.0` = native rate, `1.2` = 20% faster, `0.8` = 20% slower.
   *
   * @default 1
   */
  speed?: number
  /** Caller-supplied speech text (raw text or SSML when {@link extraOptions} signals so). */
  text: string
  /** Provider voice id (e.g. `en-US-AvaMultilingualNeural`, `longxiaochun`, `BV001_streaming`). */
  voice?: string
}

/**
 * Result of a successful upstream call.
 *
 * `body` is either a fully-buffered `ArrayBuffer` (current v1 behavior — Azure
 * REST + DashScope JSON + Volcengine JSON are all one-shot) or a streaming
 * body for future streaming adapters.
 */
export interface TtsResult {
  /** Audio payload (buffered or streamed). */
  body: ArrayBuffer | ReadableStream<Uint8Array>
  /** MIME type to forward to the caller (e.g. `audio/mpeg`, `audio/wav`). */
  contentType: string
}

/**
 * Per-call context for {@link TtsAdapter.getVoiceCatalog}.
 *
 * `keyPlaintext` and `region` are mandatory for live providers (Azure) that
 * proxy through unspeech and call the upstream provider with a subscription
 * key; the router decrypts the envelope key and forwards `adapterParams.region`
 * verbatim. Unspeech-backed static catalogs ignore both fields.
 *
 * `unspeechBaseURL` is `UNSPEECH_UPSTREAM.restBaseURL` resolved by the router.
 * Passing it through the context keeps adapters free of configKV coupling.
 */
export interface TtsVoiceCatalogContext {
  /** Caller-side abort signal — propagated to the upstream fetch. */
  abortSignal?: AbortSignal
  /** Free-form adapter-specific params (mirrors `tts.upstreams[i].adapterParams`). */
  adapterParams: Record<string, unknown>
  /** Fetch implementation. Tests inject `vi.fn()`; production passes `globalThis.fetch`. */
  fetchImpl: typeof fetch
  /** Decrypted upstream credential (live providers only). */
  keyPlaintext?: Buffer
  /** Provider region (live providers only). */
  region?: string
  /** unspeech REST base URL, no trailing slash. */
  unspeechBaseURL: string
}
