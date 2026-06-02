/**
 * web-rwkv inference engine (worker-side, transport-agnostic).
 *
 * Owns the full in-browser RWKV lifecycle against `@cryscan/web-rwkv-wasm`:
 *
 * - **load**: fetch f16 `safetensors` + the World vocab (Cache Storage backed),
 *   derive the layer count, resolve the catalog quantization to per-scheme
 *   layer counts, and build a `Session` (which quantizes on the GPU) + `Tokenizer`.
 * - **cache**: web-rwkv's built-in prefix cache — `checkout` reuses the state of
 *   a shared token prefix across turns, `cache` repopulates it after each turn,
 *   so re-sending a growing conversation only runs the new suffix.
 * - **generate**: the autoregressive sampling loop (`run` → `transform` →
 *   `softmax` → `sample`), streaming decoded tokens and stopping on the
 *   end-of-text token, a stop sequence, or the token cap.
 *
 * The engine knows nothing about how requests arrive; see `transport.ts` for
 * the wire binding and `worker.ts` for the wiring.
 */

import type { RwkvQuantization } from './constants'
import type { SafetensorsHeader } from './safetensors'
import type {
  RwkvFinishReason,
  RwkvGenerateDelta,
  RwkvGenerateRequest,
  RwkvGenerateResult,
  RwkvLoadProgress,
  RwkvModelInfo,
} from './types'

import init, {
  NucleusSampler,
  Session,
  SessionType,
  Tensor,
  TensorReader,
  Tokenizer,
} from '@cryscan/web-rwkv-wasm'
import wasmUrl from '@cryscan/web-rwkv-wasm/web_rwkv_wasm_bg.wasm?url'

import {
  deriveNumLayer,
  parseSafetensorsHeader,
  resolveQuantLayerCounts,
} from './safetensors'
import { fetchCached, fetchCachedText } from './weights'

/** Everything the engine needs to load one checkpoint. */
export interface RwkvLoadDescriptor {
  /** URL of the f16 `safetensors` weights. */
  modelUrl: string
  /** URL of the World tokenizer vocab JSON. */
  vocabUrl: string
  /** Quantization to apply on-device (reduces VRAM, not download size). */
  quantization: RwkvQuantization
}

export interface RwkvLoadOptions {
  /** Aborts the download/compile. */
  signal?: AbortSignal
  /** Receives streamed load progress. */
  onProgress?: (progress: RwkvLoadProgress) => void
}

export interface RwkvGenerateOptions {
  /** Aborts generation between tokens. */
  signal?: AbortSignal
  /** Receives each decoded token as it is produced. */
  onToken?: (delta: RwkvGenerateDelta) => void
}

/** The web-rwkv engine instance. Assumes calls are serialized by the caller. */
export interface RwkvEngine {
  load: (descriptor: RwkvLoadDescriptor, options?: RwkvLoadOptions) => Promise<RwkvModelInfo>
  generate: (request: RwkvGenerateRequest, options?: RwkvGenerateOptions) => Promise<RwkvGenerateResult>
  unload: () => Promise<void>
}

/**
 * The RWKV World end-of-text token. Generation stops when it is sampled.
 * (Token 0 in `rwkv_vocab_v20230424.json`.)
 */
const END_OF_TEXT_TOKEN = 0

/** ModelVersion enum (0..3) → catalog version label, indexed by the enum value. */
const VERSION_NAMES = ['v4', 'v5', 'v6', 'v7'] as const

/** Conversational sampling defaults (mirrors the web-rwkv-puzzles chat demo). */
const SAMPLING_DEFAULTS = {
  temperature: 1.0,
  topP: 0.5,
  presencePenalty: 0.4,
  countPenalty: 0.4,
  penaltyDecay: 0.996,
} as const

let wasmReady: Promise<unknown> | null = null

/** Instantiate the wasm module exactly once; subsequent calls share the promise. */
function ensureWasm(): Promise<unknown> {
  if (!wasmReady)
    wasmReady = init({ module_or_path: wasmUrl })
  return wasmReady
}

/**
 * Create a web-rwkv engine.
 *
 * Use when:
 * - Standing up the RWKV worker (one engine per worker).
 *
 * Expects:
 * - A WebGPU-capable context; web-rwkv has no CPU/WASM compute fallback.
 * - Serialized calls — a single `Session` is shared, and its GPU state is not
 *   reentrant across overlapping `generate` calls.
 *
 * Returns:
 * - `{ load, generate, unload }` over closure-held wasm handles.
 */
export function createRwkvEngine(): RwkvEngine {
  let session: Session | null = null
  let tokenizer: Tokenizer | null = null
  let info: RwkvModelInfo | null = null

  const textEncoder = new TextEncoder()

  function dispose(): void {
    session?.free()
    tokenizer?.free()
    session = null
    tokenizer = null
    info = null
  }

  async function load(descriptor: RwkvLoadDescriptor, options?: RwkvLoadOptions): Promise<RwkvModelInfo> {
    await ensureWasm()
    // Free any previously loaded checkpoint before downloading the next.
    dispose()

    const { signal, onProgress } = options ?? {}

    const weights = await fetchCached(descriptor.modelUrl, {
      signal,
      onProgress: p => onProgress?.({ phase: 'download-weights', percent: toPercent(p.loaded, p.total), loaded: p.loaded, total: p.total }),
    })
    throwIfAborted(signal)

    const vocab = await fetchCachedText(descriptor.vocabUrl, {
      signal,
      onProgress: p => onProgress?.({ phase: 'download-vocab', percent: toPercent(p.loaded, p.total), loaded: p.loaded, total: p.total }),
    })
    throwIfAborted(signal)

    // Compile + quantize on the GPU. Indeterminate (no byte stream to track).
    onProgress?.({ phase: 'compile', percent: -1 })

    const header = parseSafetensorsHeader(weights)
    const numLayer = deriveNumLayer(header.entries.map(entry => entry.name))
    const counts = resolveQuantLayerCounts(descriptor.quantization, numLayer)
    const reader = buildReader(weights, header)

    session = await Session.from_reader(reader, counts.int8, counts.nf4, counts.sf4, SessionType.Chat)
    tokenizer = new Tokenizer(vocab)
    info = snapshotInfo(session)
    return info
  }

  async function generate(request: RwkvGenerateRequest, options?: RwkvGenerateOptions): Promise<RwkvGenerateResult> {
    if (!session || !tokenizer)
      throw new Error('RWKV model not loaded. Call load() first.')

    const { signal, onToken } = options ?? {}
    const maxTokens = request.maxTokens ?? 256
    const stopSequences = (request.stopSequences ?? []).filter(Boolean)
    const sampling = { ...SAMPLING_DEFAULTS, ...request.sampling }

    // ModelInfo is a wasm handle; keep it alive for the sampler, free at the end.
    const modelInfo = session.info()
    const sampler = new NucleusSampler(
      modelInfo,
      sampling.temperature,
      sampling.topP,
      sampling.presencePenalty,
      sampling.countPenalty,
      sampling.penaltyDecay,
    )

    try {
      const logits = new Float32Array(modelInfo.num_vocab)
      const probs = new Float32Array(modelInfo.num_vocab)
      const state = new Float32Array(session.state_len())

      if (request.fresh)
        session.clear_cache()

      const promptTokens = tokenizer.encode(textEncoder.encode(request.prompt))

      // Reuse the cached prefix: `checkout` fills `state`/`logits` for the
      // longest matching prefix and returns its length, so we only run the rest.
      const cutoff = session.checkout(promptTokens, state, logits)
      session.load(state)
      let tokens = promptTokens.slice(cutoff)

      // A streaming decoder so multi-byte UTF-8 split across tokens is correct.
      const decoder = new TextDecoder()
      const generated: number[] = []
      let text = ''
      let finishReason: RwkvFinishReason = 'length'

      for (let i = 0; i < maxTokens; i++) {
        throwIfAborted(signal)

        if (tokens.length > 0)
          await session.run(tokens, logits)

        sampler.transform(logits)
        await session.softmax(logits, probs)
        const token = sampler.sample(probs)

        if (token === END_OF_TEXT_TOKEN) {
          finishReason = 'eos'
          break
        }

        sampler.update(Uint32Array.of(token))
        generated.push(token)

        const piece = decoder.decode(tokenizer.decode(Uint32Array.of(token)), { stream: true })
        if (piece) {
          text += piece
          onToken?.({ token, text: piece })
        }

        const matched = stopSequences.find(seq => text.includes(seq))
        if (matched) {
          text = text.slice(0, text.indexOf(matched))
          finishReason = 'stop'
          break
        }

        tokens = Uint32Array.of(token)
      }

      text += decoder.decode() // flush any bytes buffered mid-codepoint

      // Repopulate the prefix cache with the *full* turn (prompt + response) so
      // the next turn can reuse this entire context, not just the prompt.
      const fullHistory = Uint32Array.from([...promptTokens, ...generated])
      await session.back(state)
      session.cache(fullHistory, state, logits)

      return { text, tokens: generated.length, finishReason }
    }
    finally {
      sampler.free()
      modelInfo.free()
    }
  }

  async function unload(): Promise<void> {
    dispose()
  }

  return { load, generate, unload }
}

/** Build a web-rwkv `TensorReader` by slicing each tensor out of the buffer. */
function buildReader(buffer: ArrayBuffer, header: SafetensorsHeader): TensorReader {
  const tensors = header.entries.map(entry => new Tensor(
    entry.name,
    Uint32Array.from(entry.shape),
    buffer.slice(header.dataStart + entry.start, header.dataStart + entry.end),
  ))
  return new TensorReader(tensors)
}

/** Copy the scalar `ModelInfo` fields the main thread needs, then free the handle. */
function snapshotInfo(loaded: Session): RwkvModelInfo {
  const modelInfo = loaded.info()
  try {
    return {
      numLayer: modelInfo.num_layer,
      numVocab: modelInfo.num_vocab,
      numEmb: modelInfo.num_emb,
      version: VERSION_NAMES[modelInfo.version] ?? 'v7',
    }
  }
  finally {
    modelInfo.free()
  }
}

/** Bytes → 0-100 percent, or -1 when the total is unknown. */
function toPercent(loaded: number, total: number): number {
  return total > 0 ? Math.round((loaded / total) * 100) : -1
}

/** Throw a DOM `AbortError` if the signal is already aborted. */
function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted)
    throw new DOMException('The operation was aborted', 'AbortError')
}
