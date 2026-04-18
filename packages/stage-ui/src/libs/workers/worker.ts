/**
 * Whisper ASR Web Worker.
 *
 * Uses the unified inference protocol from protocol.ts.
 * Streaming token updates are sent as progress messages with phase 'inference'.
 */

import type {
  ModelOutput,
  PreTrainedModel,
  PreTrainedTokenizer,
  Processor,
  ProgressCallback,
  Tensor,
} from '@huggingface/transformers'

import type {
  ErrorResponse,
  InferenceResultResponse,
  LoadModelRequest,
  ModelReadyResponse,
  ProgressResponse,
  RunInferenceRequest,
  WorkerInboundMessage,
} from '../inference/protocol'

import {
  AutoProcessor,
  AutoTokenizer,
  full,
  TextStreamer,
  WhisperForConditionalGeneration,
} from '@huggingface/transformers'

import { MODEL_IDS, MODEL_NAMES } from '../inference/constants'
import { classifyError, isRecoverable } from '../inference/protocol'

// ---------------------------------------------------------------------------
// Inference-specific input/output types
// ---------------------------------------------------------------------------

export interface WhisperInput {
  /** @deprecated Use audioFloat32 instead */
  audio?: string
  audioFloat32?: Float32Array
  language: string
}

export interface WhisperOutput {
  text: string[]
}

/** Streaming update sent during transcription as a progress message */
export interface WhisperStreamUpdate {
  output: ModelOutput | Tensor
  tps?: number
  numTokens: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_NEW_TOKENS = 64
const MODEL_ID = MODEL_IDS.WHISPER

// ---------------------------------------------------------------------------
// Model singleton
// ---------------------------------------------------------------------------

/**
 * Detect whether WebGPU is available inside the worker.
 * Workers don't have access to `navigator.gpu` on all browsers,
 * so we do a simple feature check.
 */
async function detectWebGPUInWorker(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.gpu)
      return false
    const adapter = await navigator.gpu.requestAdapter()
    return adapter != null
  }
  catch {
    return false
  }
}

// Track which device was actually used (for reporting back to main thread)
let resolvedDevice: 'webgpu' | 'wasm' | 'cpu' = 'webgpu'

class AutomaticSpeechRecognitionPipeline {
  static model_id: string | null = null
  static tokenizer: Promise<PreTrainedTokenizer>
  static processor: Promise<Processor>
  static model: Promise<PreTrainedModel>

  static async getInstance(progress_callback?: ProgressCallback, device: 'webgpu' | 'wasm' | 'cpu' = 'webgpu') {
    this.model_id = MODEL_ID

    // Auto-detect: if WebGPU was requested but unavailable, fall back to WASM
    let actualDevice = device
    if (device === 'webgpu') {
      const hasWebGPU = await detectWebGPUInWorker()
      if (!hasWebGPU) {
        console.warn('[Whisper Worker] WebGPU not available, falling back to WASM')
        actualDevice = 'wasm'
      }
    }
    resolvedDevice = actualDevice

    this.tokenizer ??= AutoTokenizer.from_pretrained(this.model_id, {
      progress_callback,
    })

    this.processor ??= AutoProcessor.from_pretrained(this.model_id, {
      progress_callback,
    })

    // NOTICE: fp16 encoder may fail on some devices/browsers. Fall back to fp32
    // if the initial load fails. Decoder fp16 is known broken (see Issue #989).
    // https://github.com/huggingface/transformers.js/issues/989
    this.model ??= (async () => {
      try {
        return await WhisperForConditionalGeneration.from_pretrained(this.model_id!, {
          dtype: {
            encoder_model: 'fp16',
            decoder_model_merged: 'q4',
          },
          device: actualDevice,
          progress_callback,
        })
      }
      catch (error) {
        console.warn(
          '[Whisper Worker] fp16 encoder failed, falling back to fp32:',
          error instanceof Error ? error.message : error,
        )
        return await WhisperForConditionalGeneration.from_pretrained(this.model_id!, {
          dtype: {
            encoder_model: 'fp32',
            decoder_model_merged: 'q4',
          },
          device: actualDevice,
          progress_callback,
        })
      }
    })()

    return Promise.all([this.tokenizer, this.processor, this.model])
  }
}

/**
 * Convert base64-encoded WAV audio to Float32Array features.
 * @deprecated Prefer sending Float32Array directly via transferable for zero-copy.
 */
async function base64ToFeatures(base64Audio: string): Promise<Float32Array> {
  const binaryString = atob(base64Audio)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }

  const samples = new Int16Array(bytes.buffer.slice(44))
  const audio = new Float32Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    audio[i] = samples[i] / 32768.0
  }

  return audio
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * RequestIds the main thread has asked us to cancel. When an in-flight
 * operation resolves, we check this set before posting the result; if
 * the id is present, we send a `CANCELLED` error instead so the adapter
 * rejects the caller's promise deterministically.
 *
 * We cannot synchronously interrupt a transformers.js call already running
 * on this thread (no abort primitive is exposed) — cancellation here is
 * about not leaking the stale result, not about stopping GPU work.
 */
const cancelledRequestIds = new Set<string>()

function markCancelled(targetRequestId: string): void {
  cancelledRequestIds.add(targetRequestId)
  // Emit the error now so the adapter can resolve immediately even if
  // the inference keeps running in the background.
  const msg: ErrorResponse = {
    type: 'error',
    requestId: targetRequestId,
    payload: {
      code: 'CANCELLED',
      message: 'Operation cancelled by caller',
      recoverable: false,
    },
  }
  globalThis.postMessage(msg)
}

function isCancelled(requestId: string): boolean {
  return cancelledRequestIds.has(requestId)
}

function clearCancelled(requestId: string): void {
  cancelledRequestIds.delete(requestId)
}

function sendProgress(requestId: string, phase: 'download' | 'compile' | 'warmup' | 'inference', percent: number, message?: string, extra?: Record<string, unknown>): void {
  const msg: ProgressResponse = {
    type: 'progress',
    requestId,
    payload: {
      phase,
      percent,
      message,
      ...extra,
    },
  }
  globalThis.postMessage(msg)
}

function sendError(requestId: string, error: unknown, phase?: 'load' | 'inference'): void {
  const message = error instanceof Error ? error.message : String(error)
  const code = classifyError(error, phase)
  const msg: ErrorResponse = {
    type: 'error',
    requestId,
    payload: {
      code,
      message,
      recoverable: isRecoverable(code),
    },
  }
  globalThis.postMessage(msg)
}

// ---------------------------------------------------------------------------
// Load model
// ---------------------------------------------------------------------------

// Track the requestId of the current load operation for progress callbacks
let currentLoadRequestId: string | null = null

async function loadModel(request: LoadModelRequest): Promise<void> {
  const { requestId, device } = request
  currentLoadRequestId = requestId

  try {
    sendProgress(requestId, 'download', -1, 'Loading model...')

    const [_tokenizer, _processor, model] = await AutomaticSpeechRecognitionPipeline.getInstance((x: any) => {
      // Forward transformers.js progress events
      if (currentLoadRequestId) {
        if (x.status === 'progress') {
          sendProgress(currentLoadRequestId, 'download', x.progress != null ? Math.round(x.progress * 100) : -1, undefined, {
            file: x.file,
            loaded: x.loaded,
            total: x.total,
          })
        }
        else if (x.status === 'initiate') {
          sendProgress(currentLoadRequestId, 'download', 0, `Loading ${x.file}`, { file: x.file })
        }
      }
    }, device as 'webgpu' | 'wasm' | 'cpu')

    sendProgress(requestId, 'warmup', -1, 'Compiling shaders and warming up model...')

    // Run model with dummy input to compile WebGPU shaders.
    // NOTICE: Using minimal time-steps (1) instead of 3000 to reduce warm-up latency.
    // The feature dimension (128) must match the encoder's expected mel-spectrogram bins for fp16.
    await model.generate({
      input_features: full([1, 128, 1], 0.0),
      max_new_tokens: 1,
    } as Record<string, unknown>)

    if (isCancelled(requestId)) {
      // Adapter already received a CANCELLED error; drop the stale result.
      clearCancelled(requestId)
    }
    else {
      const ready: ModelReadyResponse = {
        type: 'model-ready',
        requestId,
        modelId: MODEL_NAMES.WHISPER,
        device: resolvedDevice,
      }
      globalThis.postMessage(ready)
    }
  }
  catch (error) {
    if (isCancelled(requestId))
      clearCancelled(requestId)
    else
      sendError(requestId, error, 'load')
  }
  finally {
    currentLoadRequestId = null
  }
}

// ---------------------------------------------------------------------------
// Run inference (transcription)
// ---------------------------------------------------------------------------

let processing = false

async function runInference(request: RunInferenceRequest<WhisperInput>): Promise<void> {
  const { requestId, input } = request

  if (processing) {
    sendError(requestId, new Error('Worker is busy processing another request'), 'inference')
    return
  }
  processing = true

  try {
    sendProgress(requestId, 'inference', 0, 'Starting transcription...')

    const audioData = input.audioFloat32 ?? await base64ToFeatures(input.audio!)
    const [tokenizer, processor, model] = await AutomaticSpeechRecognitionPipeline.getInstance()

    let startTime: number | undefined
    let numTokens = 0
    const callback_function = (output: ModelOutput | Tensor) => {
      startTime ??= performance.now()

      let tps: number | undefined
      if (numTokens++ > 0) {
        tps = numTokens / (performance.now() - startTime!) * 1000
      }

      // Send streaming updates as progress messages with inference phase
      sendProgress(requestId, 'inference', -1, undefined, { output, tps, numTokens } as any)
    }

    const streamer = new TextStreamer(tokenizer, {
      skip_prompt: true,
      decode_kwargs: { skip_special_tokens: true },
      callback_function,
    })

    const inputs = await processor(audioData)

    const outputs = await model.generate({
      ...inputs,
      max_new_tokens: MAX_NEW_TOKENS,
      language: input.language,
      streamer,
    })

    const outputText = tokenizer.batch_decode(outputs as Tensor, { skip_special_tokens: true })

    if (isCancelled(requestId)) {
      clearCancelled(requestId)
    }
    else {
      const result: InferenceResultResponse<WhisperOutput> = {
        type: 'inference-result',
        requestId,
        output: { text: outputText },
      }
      globalThis.postMessage(result)
    }
  }
  catch (error) {
    if (isCancelled(requestId))
      clearCancelled(requestId)
    else
      sendError(requestId, error, 'inference')
  }
  finally {
    processing = false
  }
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

globalThis.addEventListener('message', async (event: MessageEvent<WorkerInboundMessage<WhisperInput>>) => {
  const message = event.data

  switch (message.type) {
    case 'load-model':
      await loadModel(message)
      break
    case 'run-inference':
      await runInference(message as RunInferenceRequest<WhisperInput>)
      break
    case 'unload-model':
      // Whisper uses singleton pattern — can't fully unload, but acknowledge
      globalThis.postMessage({ type: 'model-unloaded', requestId: message.requestId })
      break
    case 'cancel':
      markCancelled(message.targetRequestId)
      break
  }
})
