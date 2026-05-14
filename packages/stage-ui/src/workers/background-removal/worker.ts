/**
 * Background removal Web Worker.
 *
 * Runs the Xenova/modnet model inference off the main thread.
 * Uses the unified inference protocol from protocol.ts.
 */

import type { PreTrainedModel, Processor } from '@huggingface/transformers'

import type {
  ErrorResponse,
  InferenceResultResponse,
  LoadModelRequest,
  ModelReadyResponse,
  ProgressResponse,
  RunInferenceRequest,
  WorkerInboundMessage,
} from '../../libs/inference/protocol'

import { AutoModel, AutoProcessor, env, RawImage } from '@huggingface/transformers'

import { MODEL_IDS, MODEL_NAMES } from '../../libs/inference/constants'
import { classifyError, isRecoverable } from '../../libs/inference/protocol'

// ---------------------------------------------------------------------------
// Inference-specific input/output types
// ---------------------------------------------------------------------------

export interface BackgroundRemovalInput {
  imageData: Uint8ClampedArray
  width: number
  height: number
}

export interface BackgroundRemovalOutput {
  maskData: Uint8Array
  width: number
  height: number
}

// ---------------------------------------------------------------------------
// Model singleton
// ---------------------------------------------------------------------------

let model: PreTrainedModel | null = null
let processor: Processor | null = null

const MODEL_ID = MODEL_IDS.BG_REMOVAL

function sendProgress(requestId: string, percent: number, message?: string): void {
  const msg: ProgressResponse = {
    type: 'progress',
    requestId,
    payload: {
      phase: 'download',
      percent,
      message,
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

// NOTICE: Cancellation tracking — see Whisper worker for rationale.
const cancelledRequestIds = new Set<string>()

function markCancelled(targetRequestId: string): void {
  cancelledRequestIds.add(targetRequestId)
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

/**
 * Detect whether WebGPU is available inside the worker.
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

let resolvedDevice: 'webgpu' | 'wasm' | 'cpu' = 'webgpu'

async function loadModel(request: LoadModelRequest): Promise<void> {
  const { requestId } = request

  try {
    if (model && processor) {
      if (isCancelled(requestId)) {
        clearCancelled(requestId)
        return
      }
      const ready: ModelReadyResponse = {
        type: 'model-ready',
        requestId,
        modelId: MODEL_NAMES.BG_REMOVAL,
        device: resolvedDevice,
      }
      globalThis.postMessage(ready)
      return
    }

    // Auto-detect: if WebGPU was requested but unavailable, fall back to WASM
    let device = request.device ?? 'webgpu'
    if (device === 'webgpu') {
      const hasWebGPU = await detectWebGPUInWorker()
      if (!hasWebGPU) {
        console.warn('[BG Removal Worker] WebGPU not available, falling back to WASM')
        device = 'wasm'
      }
    }
    resolvedDevice = device as 'webgpu' | 'wasm' | 'cpu'

    env.backends.onnx.wasm!.proxy = false

    model = await AutoModel.from_pretrained(MODEL_ID, {
      device,
      progress_callback: (progress: any) => {
        sendProgress(requestId, progress?.progress ?? -1, progress?.status)
      },
    })

    processor = await AutoProcessor.from_pretrained(MODEL_ID, {})

    if (isCancelled(requestId)) {
      clearCancelled(requestId)
      return
    }

    const ready: ModelReadyResponse = {
      type: 'model-ready',
      requestId,
      modelId: MODEL_NAMES.BG_REMOVAL,
      device: resolvedDevice,
    }
    globalThis.postMessage(ready)
  }
  catch (error) {
    if (isCancelled(requestId))
      clearCancelled(requestId)
    else
      sendError(requestId, error, 'load')
  }
}

// ---------------------------------------------------------------------------
// Processing
// ---------------------------------------------------------------------------

async function runInference(request: RunInferenceRequest<BackgroundRemovalInput>): Promise<void> {
  const { requestId, input } = request
  const { imageData, width, height } = input

  try {
    if (!model || !processor) {
      throw new Error('Model not loaded. Send load-model first.')
    }

    // Create RawImage from the raw pixel data
    const img = new RawImage(imageData, width, height, 4)

    // Pre-process
    const { pixel_values } = await processor(img)

    // Run inference
    const { output } = await model({ input: pixel_values })

    // Extract mask and resize to original dimensions
    const mask = await RawImage.fromTensor(
      output[0].mul(255).to('uint8'),
    ).resize(width, height)

    if (isCancelled(requestId)) {
      clearCancelled(requestId)
      return
    }

    const maskData = new Uint8Array(mask.data.buffer)

    const result: InferenceResultResponse<BackgroundRemovalOutput> = {
      type: 'inference-result',
      requestId,
      output: { maskData, width, height },
    }
    // Transfer the buffer to avoid copying
    ;(globalThis as any).postMessage(result, [maskData.buffer])
  }
  catch (error) {
    if (isCancelled(requestId))
      clearCancelled(requestId)
    else
      sendError(requestId, error, 'inference')
  }
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

globalThis.addEventListener('message', async (event: MessageEvent<WorkerInboundMessage<BackgroundRemovalInput>>) => {
  const message = event.data

  switch (message.type) {
    case 'load-model':
      await loadModel(message)
      break
    case 'run-inference':
      await runInference(message as RunInferenceRequest<BackgroundRemovalInput>)
      break
    case 'unload-model':
      model = null
      processor = null
      globalThis.postMessage({ type: 'model-unloaded', requestId: message.requestId })
      break
    case 'cancel':
      markCancelled(message.targetRequestId)
      break
  }
})
