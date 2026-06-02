/**
 * web-rwkv worker domain types.
 *
 * These describe the *what* of the worker's operations (load a model, generate
 * text) independently of *how* requests and responses travel between the main
 * thread and the worker. The transport (see `transport.ts`) carries these
 * shapes; the engine (see `engine.ts`) produces them. Keeping them here lets
 * the transport binding be swapped (hand-rolled `postMessage` today, the
 * `@moeru/eventa` contract from PR #1917 tomorrow) without touching the engine.
 */

import type { RwkvModel, RwkvModelId, RwkvQuantization } from './constants'

/**
 * Sampling configuration for one generation request.
 *
 * Maps 1:1 onto web-rwkv's `NucleusSampler` constructor arguments; every field
 * is optional and falls back to a conversational default in the engine.
 */
export interface RwkvSamplingOptions {
  /**
   * Softmax temperature, applied as `prob^(1/temp)`.
   * @default 1.0
   */
  temperature?: number
  /**
   * Nucleus (top-p) cutoff.
   * @default 0.5
   */
  topP?: number
  /**
   * Flat penalty applied once a token has appeared (`presence_penalty`).
   * @default 0.4
   */
  presencePenalty?: number
  /**
   * Per-occurrence penalty scaled by token count (`count_penalty`).
   * @default 0.4
   */
  countPenalty?: number
  /**
   * Multiplicative decay of accumulated counts each step (`penalty_decay`).
   * @default 0.996
   */
  penaltyDecay?: number
}

/** Request to load (download + quantize + compile) a catalog model. */
export interface RwkvLoadRequest {
  /** Catalog id from `RWKV_MODELS`; resolves to a weights URL + quantization. */
  modelId: RwkvModelId
}

/**
 * Essentials of web-rwkv's `ModelInfo`, surfaced to the main thread.
 *
 * The raw `ModelInfo` is a wasm-owned handle that cannot cross the worker
 * boundary, so the engine copies the scalar fields callers actually need.
 */
export interface RwkvModelInfo {
  /** Transformer layer count (`num_layer`); also the quantized-layer count. */
  numLayer: number
  /** Vocabulary size (`num_vocab`); length of the logits/probs buffers. */
  numVocab: number
  /** Embedding width (`num_emb`). */
  numEmb: number
  /** RWKV architecture version of the loaded checkpoint. */
  version: RwkvModel['version']
}

/** Terminal payload of a successful load. */
export interface RwkvLoadResult {
  /** Echoes the requested catalog id. */
  modelId: RwkvModelId
  /** Quantization actually applied (resolved from the catalog entry). */
  quantization: RwkvQuantization
  /** Loaded model metadata. */
  info: RwkvModelInfo
}

/** Stage of a load, used to label progress for the UI. */
export type RwkvLoadPhase = 'download-weights' | 'download-vocab' | 'compile'

/** A single load-progress chunk (server-streamed during `load`). */
export interface RwkvLoadProgress {
  /** Which load stage this chunk reports. */
  phase: RwkvLoadPhase
  /** 0-100, or -1 when the total is unknown (indeterminate). */
  percent: number
  /** Bytes downloaded so far (download phases only). */
  loaded?: number
  /** Total bytes, when the server reported `content-length`. */
  total?: number
}

/** Request to generate a completion from a fully-formatted prompt. */
export interface RwkvGenerateRequest {
  /**
   * The exact prompt fed to the tokenizer. Chat-template formatting
   * (`User: …\n\nAssistant:`) is the caller's responsibility, not the
   * worker's, so the engine stays a pure text-completion boundary.
   */
  prompt: string
  /**
   * Hard cap on generated tokens.
   * @default 256
   */
  maxTokens?: number
  /** Decoded substrings that end generation when produced. */
  stopSequences?: string[]
  /** Sampling overrides; omitted fields use conversational defaults. */
  sampling?: RwkvSamplingOptions
  /**
   * Clear the prefix-state cache before generating, starting a fresh context.
   * Leave `false` to let web-rwkv reuse the shared prefix of the prior turn.
   * @default false
   */
  fresh?: boolean
}

/** One streamed generation step. */
export interface RwkvGenerateDelta {
  /** The sampled token id. */
  token: number
  /** The incremental decoded text for this token (may be empty mid-codepoint). */
  text: string
}

/** Why generation stopped. */
export type RwkvFinishReason = 'stop' | 'length' | 'eos'

/** Terminal payload of a generation. */
export interface RwkvGenerateResult {
  /** Full decoded text (with any matched stop sequence trimmed off the end). */
  text: string
  /** Number of tokens produced. */
  tokens: number
  /** Stop cause: a stop sequence, the token cap, or the end-of-text token. */
  finishReason: RwkvFinishReason
}
