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

import { classifyError } from '../../libs/inference/protocol'

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

const MODEL_ID = 'Xenova/modnet'

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

function sendError(requestId: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  const msg: ErrorResponse = {
    type: 'error',
    requestId,
    payload: {
      code: classifyError(error),
      message,
      recoverable: false,
    },
  }
  globalThis.postMessage(msg)
}

async function loadModel(request: LoadModelRequest): Promise<void> {
  const { requestId } = request

  try {
    if (model && processor) {
      const ready: ModelReadyResponse = {
        type: 'model-ready',
        requestId,
        modelId: MODEL_ID,
        device: 'webgpu',
      }
      globalThis.postMessage(ready)
      return
    }

    env.backends.onnx.wasm!.proxy = false

    model = await AutoModel.from_pretrained(MODEL_ID, {
      device: request.device ?? 'webgpu',
      progress_callback: (progress: any) => {
        sendProgress(requestId, progress?.progress ?? -1, progress?.status)
      },
    })

    processor = await AutoProcessor.from_pretrained(MODEL_ID, {})

    const ready: ModelReadyResponse = {
      type: 'model-ready',
      requestId,
      modelId: MODEL_ID,
      device: 'webgpu',
    }
    globalThis.postMessage(ready)
  }
  catch (error) {
    sendError(requestId, error)
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
    sendError(requestId, error)
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
  }
})
