import { errorMessageFromValue } from '@proj-airi/stage-shared'
/**
 * Unified inference worker message protocol.
 *
 * All inference workers (Kokoro, Whisper, background-removal, etc.)
 * communicate with the main thread through this typed protocol.
 * Each adapter maps its domain-specific messages to/from these types.
 *
 * ## Architecture Note: GPU Device Isolation
 *
 * Each Web Worker creates its own GPUDevice via `navigator.gpu.requestAdapter()`.
 * WebGPU does not support sharing a GPUDevice across workers — this is a platform
 * limitation, not a design choice. To mitigate the cost of multiple device contexts:
 *
 * - **LoadQueue** ensures only one model loads at a time (prevents bandwidth/VRAM spikes)
 * - **GPUResourceCoordinator** tracks estimated VRAM across all models and emits
 *   memory pressure events so the app can unload LRU models when nearing budget
 * - Workers auto-detect WebGPU availability and fall back to WASM when unavailable
 */

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

/**
 * Cancel an in-flight or queued request. The worker should stop any
 * ongoing work tied to `targetRequestId` and must NOT send a normal
 * `model-ready` / `inference-result` response for that request; instead
 * it should send an `ErrorResponse` with code `'CANCELLED'` so the
 * adapter can reject the caller's promise deterministically.
 *
 * NOTE: Cancellation is best-effort. We cannot interrupt a synchronous
 * transformers.js / ONNX Runtime call that is already executing on the
 * worker thread. What the cancel signal does guarantee is that the
 * adapter stops waiting and the worker discards the result when it
 * eventually arrives.
 */
export interface CancelRequest {
  requestId: string
  /** The requestId of the operation to cancel */
  targetRequestId: string
  type: 'cancel'
}

export interface ErrorPayload {
  code: InferenceErrorCode
  message: string
  /** Whether the operation can be retried (e.g. with WASM fallback) */
  recoverable: boolean
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export interface ErrorResponse {
  payload: ErrorPayload
  requestId: string
  type: 'error'
}

export type InferenceErrorCode
  = | 'CANCELLED'
    | 'DEVICE_LOST'
    | 'INFERENCE_FAILED'
    | 'LOAD_FAILED'
    | 'OOM'
    | 'TIMEOUT'
    | 'UNKNOWN'

// ---------------------------------------------------------------------------
// Main → Worker requests
// ---------------------------------------------------------------------------

export interface InferenceResultResponse<TOutput = unknown> {
  /** Worker-side timing in milliseconds */
  durationMs?: number
  output: TOutput
  requestId: string
  type: 'inference-result'
}

export interface LoadModelRequest {
  device: 'cpu' | 'wasm' | 'webgpu'
  dtype?: string
  modelId: string
  /** Adapter-specific options passed through opaquely */
  options?: Record<string, unknown>
  requestId: string
  type: 'load-model'
}

export interface ModelReadyResponse {
  device: 'cpu' | 'wasm' | 'webgpu'
  /** Domain-specific metadata (e.g. Kokoro voices) */
  metadata?: Record<string, unknown>
  modelId: string
  requestId: string
  type: 'model-ready'
}

export interface ModelUnloadedResponse {
  requestId: string
  type: 'model-unloaded'
}

export interface ProgressPayload {
  /** File being downloaded (for download phase) */
  file?: string
  /** Bytes loaded / total (for download phase) */
  loaded?: number
  /** Optional human-readable status */
  message?: string
  /**
   * Progress percentage, normalized to 0-100 range.
   * Use -1 when the progress is indeterminate.
   *
   * Adapters are responsible for normalizing worker-specific ranges:
   * - @huggingface/transformers progress_callback: already 0-100
   * - Whisper status 'progress': 0-1 → multiply by 100
   */
  percent: number
  phase: ProgressPhase
  total?: number
}

// ---------------------------------------------------------------------------
// Worker → Main responses
// ---------------------------------------------------------------------------

export type ProgressPhase = 'compile' | 'download' | 'inference' | 'warmup'

export interface ProgressResponse {
  payload: ProgressPayload
  requestId: string
  type: 'progress'
}

export interface RunInferenceRequest<TInput = unknown> {
  input: TInput
  requestId: string
  type: 'run-inference'
}

export interface UnloadModelRequest {
  requestId: string
  type: 'unload-model'
}

export type WorkerInboundMessage<TInput = unknown>
  = | CancelRequest
    | LoadModelRequest
    | RunInferenceRequest<TInput>
    | UnloadModelRequest

export type WorkerOutboundMessage<TOutput = unknown>
  = | ErrorResponse
    | InferenceResultResponse<TOutput>
    | ModelReadyResponse
    | ModelUnloadedResponse
    | ProgressResponse

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let counter = 0

/** Generate a lightweight unique request ID */
export function createRequestId(): string {
  return `req_${Date.now().toString(36)}_${(counter++).toString(36)}`
}

// NOTICE: Patterns observed in WebGPU device loss errors across Chromium,
// Firefox, Safari, and ONNX Runtime Web / transformers.js. Because we do not
// own the GPUDevice (it is created internally by transformers.js / ORT-web),
// we cannot attach a `device.lost` promise handler directly — string matching
// on thrown errors is the only available detection signal.
// References:
//   - https://gpuweb.github.io/gpuweb/#gpudevicelostinfo
//   - https://github.com/huggingface/transformers.js/issues/715
const DEVICE_LOSS_PATTERNS = [
  'device was lost',
  'device lost',
  'gpu device lost',
  'gpudevice was invalidated',
  'gpudevice is invalid',
  'device destroyed',
  'gpu process crashed',
  'gpu process lost',
  'webgpu device is invalid',
] as const

/** Reason classification for a device-loss event, following `GPUDeviceLostInfo.reason`. */
export type DeviceLossReason = 'destroyed' | 'unknown'

/**
 * Canonical error thrown by inference adapters when an operation is
 * cancelled via AbortSignal. Matches the DOM convention of `name === 'AbortError'`
 * so existing `if (err.name === 'AbortError')` checks work unchanged.
 */
export class InferenceAbortError extends Error {
  readonly code = 'CANCELLED' as const
  override readonly name = 'AbortError'

  constructor(message = 'The operation was aborted') {
    super(message)
  }
}

/**
 * Best-effort classification of a device-loss reason from an error message
 * or a `GPUDeviceLostInfo`-shaped object. 'destroyed' implies intentional
 * termination (no recovery); 'unknown' implies a transient event that may
 * be recoverable via adapter restart or WASM fallback.
 */
export function classifyDeviceLossReason(error: unknown): DeviceLossReason {
  // Prefer structured info when available (some browsers attach GPUDeviceLostInfo)
  if (error && typeof error === 'object' && 'reason' in error) {
    const reason = (error as { reason?: unknown }).reason
    if (reason === 'destroyed')
      return 'destroyed'
    return 'unknown'
  }

  const msg = errorMessageFromValue(error)
  const lower = msg.toLowerCase()
  if (lower.includes('destroyed'))
    return 'destroyed'
  return 'unknown'
}

/**
 * Classify an unknown error into an `InferenceErrorCode`.
 * Used by worker adapters to normalise caught exceptions.
 *
 * Specific error patterns (OOM, DEVICE_LOST, TIMEOUT) take priority
 * over the `phase` hint. When no specific pattern matches, `phase`
 * determines whether the code is `LOAD_FAILED` or `INFERENCE_FAILED`.
 */
export function classifyError(error: unknown, phase?: 'inference' | 'load'): InferenceErrorCode {
  const msg = errorMessageFromValue(error)
  const lower = msg.toLowerCase()

  if (lower.includes('out of memory') || lower.includes('allocation failed'))
    return 'OOM'
  if (DEVICE_LOSS_PATTERNS.some(p => lower.includes(p)))
    return 'DEVICE_LOST'
  if (lower.includes('timeout'))
    return 'TIMEOUT'

  if (phase === 'load')
    return 'LOAD_FAILED'
  if (phase === 'inference')
    return 'INFERENCE_FAILED'

  return 'UNKNOWN'
}

/**
 * Determine whether an error code represents a potentially recoverable
 * condition. TIMEOUT and DEVICE_LOST may succeed on retry (e.g. with
 * WASM fallback or after device re-acquisition).
 */
export function isRecoverable(code: InferenceErrorCode): boolean {
  return code === 'TIMEOUT' || code === 'DEVICE_LOST'
}

/** Throw `InferenceAbortError` if the signal is already aborted. */
export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    const reason = signal.reason
    if (reason instanceof Error)
      throw reason
    throw new InferenceAbortError(typeof reason === 'string' ? reason : undefined)
  }
}
