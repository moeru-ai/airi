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
 * - **Kokoro generate** and **background-removal process** are *unary* invokes.
 * - **Whisper transcribe** is a *server-streaming* invoke (it emits per-token
 *   progress before the final text).
 */

import type { VoiceKey } from '../../workers/kokoro/types'
import type { ProgressPayload } from './protocol'

import { defineInvokeEventa } from '@moeru/eventa'

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

export interface KokoroGenerateRequest {
  text: string
  voice: VoiceKey
}

export interface KokoroGenerateResult {
  /** Raw PCM samples. Transferred (zero-copy) from the worker. */
  samples: Float32Array
  samplingRate: number
}

export const kokoroLoadEvent = defineInvokeEventa<LoadStreamItem, LoadModelRequest>('inference:kokoro:load')
export const kokoroGenerateEvent = defineInvokeEventa<KokoroGenerateResult, KokoroGenerateRequest>('inference:kokoro:generate')
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
