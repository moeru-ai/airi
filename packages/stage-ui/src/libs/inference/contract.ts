/**
 * Eventa RPC contract for inference workers.
 *
 * Replaces the hand-rolled `postMessage` protocol (see {@link file://./protocol.ts}
 * for the pure helpers that survive — error classification, abort, request ids).
 * Both the worker (handler) side and the main-thread (client) side import the
 * event definitions from this single module so the wire contract stays in one
 * place (AGENTS.md: define Eventa events once in a shared module).
 *
 * Transport: `@moeru/eventa/adapters/webworkers` (main) and
 * `@moeru/eventa/adapters/webworkers/worker` (worker). Both support
 * `Transferable[]` on invoke request and response, so audio sample buffers and
 * image pixel buffers stay zero-copy via {@link withTransfer} / the
 * `{ transfer }` invoke option.
 *
 * Shapes:
 * - **Model load** is a *server-streaming* invoke: the handler emits
 *   {@link LoadStreamItem} progress chunks while the model downloads/compiles,
 *   then a terminal `ready` item. Consume with {@link consumeLoadStream}.
 * - **Background-removal process** is a *unary* invoke.
 * - **Kokoro generate** and **Whisper transcribe** are *server-streaming*
 *   invokes (generate emits audio segments; transcribe emits per-token progress
 *   before the final text).
 */

import type { VoiceKey } from '../../workers/kokoro/types'
import type { ProgressPayload } from './protocol'

import { defineInvokeEventa } from '@moeru/eventa'

import { InferenceTimeoutError } from './protocol'

/** Device the worker actually ran on (after any in-worker fallback). */
export type InferenceDevice = 'webgpu' | 'wasm' | 'cpu'

/**
 * Request to load/initialize a model in a worker.
 */
export interface LoadModelRequest {
  /** Requested device. The worker may fall back (e.g. webgpu → wasm). */
  device: InferenceDevice
  /** Quantization / dtype hint, worker-specific (e.g. Kokoro `'q4'`). */
  dtype?: string
  /**
   * Model repository to load (e.g. a Hugging Face id), for workers that support
   * more than one model. Omit to use the worker's built-in default. Used by the
   * Whisper worker to select a model size; ignored by single-model workers.
   */
  model?: string
}

/** Terminal payload of a successful load stream. */
export interface ModelReadyInfo {
  /** Device the worker actually used (post-fallback). */
  device: InferenceDevice
  /** Domain-specific metadata (e.g. Kokoro voices). */
  metadata?: Record<string, unknown>
}

/**
 * One item emitted while a model loads. `progress` items repeat; exactly one
 * `ready` item terminates a successful load.
 */
export type LoadStreamItem
  = | { kind: 'progress', payload: ProgressPayload }
    | { kind: 'ready', info: ModelReadyInfo }

/**
 * Drain a model-load stream: forward progress to `onProgress` and resolve with
 * the terminal `ready` info.
 *
 * Use when:
 * - An adapter has opened a load invoke and needs the resolved device/metadata.
 *
 * Expects:
 * - The stream yields zero or more `progress` items, then one `ready` item.
 *
 * Returns:
 * - The {@link ModelReadyInfo} from the `ready` item.
 * - Throws if the stream ends without a `ready` item (treated as load failure).
 */
export async function consumeLoadStream(
  stream: ReadableStream<LoadStreamItem>,
  onProgress?: (p: ProgressPayload) => void,
): Promise<ModelReadyInfo> {
  let ready: ModelReadyInfo | undefined
  for await (const item of stream) {
    if (item.kind === 'progress')
      onProgress?.(item.payload)
    else
      ready = item.info
  }
  if (!ready)
    throw new Error('inference: model load stream ended without a ready signal')
  return ready
}

/**
 * Combine a caller's abort signal with a timeout so an operation aborts on
 * whichever fires first. Preserves the per-operation timeouts the inference
 * adapters relied on before the Eventa migration (Eventa invokes have no
 * built-in timeout).
 *
 * Use when:
 * - Awaiting an Eventa invoke that should not hang forever on a stuck worker.
 *
 * Returns:
 * - The caller signal when `timeoutMs` is not finite; otherwise a combined
 *   signal (timeout aborts with a `TimeoutError` `DOMException`).
 */
export function signalWithTimeout(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  if (!Number.isFinite(timeoutMs))
    return signal ?? new AbortController().signal
  const timeout = AbortSignal.timeout(timeoutMs)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

/** An inactivity-timeout handle for a streaming inference op. */
export interface IdleTimeout {
  /**
   * Aborts with an {@link InferenceTimeoutError} when the current window
   * elapses without a {@link IdleTimeout.reset}. OR this into the streaming
   * invoke's `signal` so a wedged worker ends the in-flight stream.
   */
  signal: AbortSignal
  /** Restart the window with the inter-chunk budget. Call on every streamed chunk. */
  reset: () => void
  /** Cancel the pending timer. Call when the stream settles (success or failure). */
  clear: () => void
}

/**
 * Two-tier inactivity (idle) timeout for a streaming inference op.
 *
 * Unlike {@link signalWithTimeout} (an absolute deadline for the whole
 * operation), this aborts only when the worker goes quiet for too long, with
 * two distinct budgets because time-to-first-output and inter-chunk gaps are
 * not the same thing:
 *
 * - `firstOutputMs` covers warmup + producing the *first* chunk (armed at
 *   construction). A wedged worker that never responds trips this; a slow but
 *   working model (e.g. Kokoro fp32 synthesizing the first sentence) does not.
 * - `idleMs` is the tighter window between subsequent chunks. The first
 *   {@link IdleTimeout.reset} (a chunk arrived ⇒ the worker is alive) switches
 *   to this budget, so a mid-stream wedge is caught sooner than `firstOutputMs`.
 *
 * The adapter calls `reset()` on each chunk and `clear()` when the stream
 * settles. Used by kokoro generate and whisper transcribe, whose adapters route
 * the resulting `TimeoutError` through the worker host's restart logic.
 *
 * @param firstOutputMs - Budget for the first chunk (warmup-inclusive).
 * @param idleMs - Budget between chunks once the worker has proven alive.
 *
 * Returns:
 * - An {@link IdleTimeout}; the signal is armed immediately with
 *   `firstOutputMs`, so a stream that never yields a first chunk still trips.
 */
export function createIdleTimeout(firstOutputMs: number, idleMs: number): IdleTimeout {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | null = null

  function clear(): void {
    if (timer != null) {
      clearTimeout(timer)
      timer = null
    }
  }

  function arm(ms: number): void {
    timer = setTimeout(
      () => controller.abort(new InferenceTimeoutError(`inference: no streamed output for ${ms}ms (worker presumed wedged)`)),
      ms,
    )
  }

  function reset(): void {
    clear()
    // A chunk just arrived, so the worker is alive: subsequent gaps use the
    // tighter inter-chunk budget. An AbortController is terminal once aborted;
    // don't re-arm a dead timer.
    if (!controller.signal.aborted)
      arm(idleMs)
  }

  // Initial window waits for the first chunk (warmup-inclusive).
  arm(firstOutputMs)
  return { signal: controller.signal, reset, clear }
}

export interface KokoroGenerateRequest {
  text: string
  voice: VoiceKey
}

/**
 * One chunk of streamed TTS audio. The worker emits one per synthesized
 * segment (kokoro-js `stream()`); the adapter accumulates them into the final
 * waveform. Streaming (rather than one unary result) lets the adapter yield the
 * GPU slot between segments so higher-priority work can preempt — see ADR-0001
 * §9. Each chunk's samples are structure-cloned, not transferred: under
 * @moeru/eventa@1.0.0-beta.5 a stream handler's `emit` takes only a value with
 * no `Transferable[]` (unlike the unary `withTransfer` path); revisit if a
 * future release adds transfer to stream emit.
 */
export interface KokoroGenerateChunk {
  /** Raw PCM samples for this segment. */
  samples: Float32Array
  samplingRate: number
}

export const kokoroLoadEvent = defineInvokeEventa<LoadStreamItem, LoadModelRequest>('inference:kokoro:load')
export const kokoroGenerateEvent = defineInvokeEventa<KokoroGenerateChunk, KokoroGenerateRequest>('inference:kokoro:generate')
export const kokoroUnloadEvent = defineInvokeEventa<void, undefined>('inference:kokoro:unload')

export interface WhisperTranscribeRequest {
  /** @deprecated Prefer `audioFloat32` (zero-copy). */
  audio?: string
  audioFloat32?: Float32Array
  language: string
}

/**
 * One item emitted while transcribing. `progress` items carry the streaming
 * token updates Whisper produces during generation (the `output` / `tps` /
 * `numTokens` extras ride on the `ProgressPayload`); exactly one `result` item
 * terminates with the decoded text.
 */
export type WhisperTranscribeItem
  = | { kind: 'progress', payload: ProgressPayload & Record<string, unknown> }
    | { kind: 'result', text: string[] }

export const whisperLoadEvent = defineInvokeEventa<LoadStreamItem, LoadModelRequest>('inference:whisper:load')
export const whisperTranscribeEvent = defineInvokeEventa<WhisperTranscribeItem, WhisperTranscribeRequest>('inference:whisper:transcribe')
export const whisperUnloadEvent = defineInvokeEventa<void, undefined>('inference:whisper:unload')

export interface BackgroundRemovalRequest {
  /** RGBA pixels. Transferred (zero-copy) to the worker. */
  imageData: Uint8ClampedArray
  width: number
  height: number
}

export interface BackgroundRemovalResult {
  /** Per-pixel alpha mask. Transferred (zero-copy) from the worker. */
  maskData: Uint8Array
  width: number
  height: number
}

export const backgroundRemovalLoadEvent = defineInvokeEventa<LoadStreamItem, LoadModelRequest>('inference:bg-removal:load')
export const backgroundRemovalProcessEvent = defineInvokeEventa<BackgroundRemovalResult, BackgroundRemovalRequest>('inference:bg-removal:process')
export const backgroundRemovalUnloadEvent = defineInvokeEventa<void, undefined>('inference:bg-removal:unload')

/**
 * Request to load an RWKV model into the web-rwkv worker. WebGPU-only (the wasm
 * has no CPU/WASM backend), so `device` is always `'webgpu'`.
 */
export interface WebRwkvLoadRequest {
  /** Always `'webgpu'` — web-rwkv has no WASM/CPU fallback. */
  device: InferenceDevice
  /** Model URL (f16/bf16/f32 web-rwkv-format `.safetensors`; bf16/f32 are cast to f16). */
  model: string
  /** Tokenizer vocab URL (RWKV World vocab JSON). Omit to use the bundled default. */
  vocab?: string
}

/** Sampling + length parameters for one web-rwkv generation. */
export interface WebRwkvGenerateRequest {
  /** Fully-templated RWKV "World" prompt (the provider builds it from chat messages). */
  prompt: string
  /** Hard cap on generated tokens. */
  maxTokens: number
  /** Sampling temperature, applied to the logits before softmax (OpenAI order). */
  temperature: number
  /** Nucleus sampling top-p. */
  topP: number
  /**
   * Top-k truncation applied (in the worker) after softmax and before top-p; `0`
   * disables it. The wasm `NucleusSampler` has no native top-k, so the worker
   * truncates the probability vector itself — see {@link applyTopK}.
   */
  topK: number
  /** Presence penalty (NucleusSampler). */
  presencePenalty: number
  /** Repetition count penalty (NucleusSampler). */
  countPenalty: number
  /** Penalty decay (NucleusSampler). */
  penaltyDecay: number
}

/** One streamed chunk of decoded text from web-rwkv generation. */
export interface WebRwkvGenerateChunk {
  text: string
}

export const webRwkvLoadEvent = defineInvokeEventa<LoadStreamItem, WebRwkvLoadRequest>('inference:web-rwkv:load')
export const webRwkvGenerateEvent = defineInvokeEventa<WebRwkvGenerateChunk, WebRwkvGenerateRequest>('inference:web-rwkv:generate')
export const webRwkvUnloadEvent = defineInvokeEventa<void, undefined>('inference:web-rwkv:unload')
