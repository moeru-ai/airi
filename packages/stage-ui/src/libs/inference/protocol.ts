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

export type ProgressPhase = 'download' | 'compile' | 'warmup' | 'inference'

export interface ProgressPayload {
  phase: ProgressPhase
  /**
   * Progress percentage, normalized to 0-100 range.
   * Use -1 when the progress is indeterminate.
   *
   * Adapters are responsible for normalizing worker-specific ranges:
   * - @huggingface/transformers progress_callback: already 0-100
   * - Whisper status 'progress': 0-1 → multiply by 100
   */
  percent: number
  /** Optional human-readable status */
  message?: string
  /** File being downloaded (for download phase) */
  file?: string
  /** Bytes loaded / total (for download phase) */
  loaded?: number
  total?: number
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type InferenceErrorCode
  = | 'OOM'
    | 'TIMEOUT'
    | 'DEVICE_LOST'
    | 'LOAD_FAILED'
    | 'INFERENCE_FAILED'
    | 'UNKNOWN'

export interface ErrorPayload {
  code: InferenceErrorCode
  message: string
  /** Whether the operation can be retried (e.g. with WASM fallback) */
  recoverable: boolean
}

// ---------------------------------------------------------------------------
// Main → Worker requests
// ---------------------------------------------------------------------------

export interface LoadModelRequest {
  type: 'load-model'
  requestId: string
  modelId: string
  device: 'webgpu' | 'wasm' | 'cpu'
  dtype?: string
  /** Adapter-specific options passed through opaquely */
  options?: Record<string, unknown>
}

export interface RunInferenceRequest<TInput = unknown> {
  type: 'run-inference'
  requestId: string
  input: TInput
}

export interface UnloadModelRequest {
  type: 'unload-model'
  requestId: string
}

export type WorkerInboundMessage<TInput = unknown>
  = | LoadModelRequest
    | RunInferenceRequest<TInput>
    | UnloadModelRequest

// ---------------------------------------------------------------------------
// Worker → Main responses
// ---------------------------------------------------------------------------

export interface ModelReadyResponse {
  type: 'model-ready'
  requestId: string
  modelId: string
  device: 'webgpu' | 'wasm' | 'cpu'
  /** Domain-specific metadata (e.g. Kokoro voices) */
  metadata?: Record<string, unknown>
}

export interface InferenceResultResponse<TOutput = unknown> {
  type: 'inference-result'
  requestId: string
  output: TOutput
  /** Worker-side timing in milliseconds */
  durationMs?: number
}

export interface ProgressResponse {
  type: 'progress'
  requestId: string
  payload: ProgressPayload
}

export interface ErrorResponse {
  type: 'error'
  requestId: string
  payload: ErrorPayload
}

export interface ModelUnloadedResponse {
  type: 'model-unloaded'
  requestId: string
}

export type WorkerOutboundMessage<TOutput = unknown>
  = | ModelReadyResponse
    | InferenceResultResponse<TOutput>
    | ProgressResponse
    | ErrorResponse
    | ModelUnloadedResponse

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let counter = 0

/** Generate a lightweight unique request ID */
export function createRequestId(): string {
  return `req_${Date.now().toString(36)}_${(counter++).toString(36)}`
}

/**
 * Classify an unknown error into an `InferenceErrorCode`.
 * Used by worker adapters to normalise caught exceptions.
 */
export function classifyError(error: unknown): InferenceErrorCode {
  const msg = error instanceof Error ? error.message : String(error)
  const lower = msg.toLowerCase()

  if (lower.includes('out of memory') || lower.includes('allocation failed'))
    return 'OOM'
  if (lower.includes('device was lost') || lower.includes('device lost'))
    return 'DEVICE_LOST'
  if (lower.includes('timeout'))
    return 'TIMEOUT'

  return 'UNKNOWN'
}
