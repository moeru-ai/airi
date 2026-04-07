/**
 * Background removal Web Worker.
 *
 * Runs the Xenova/modnet model inference off the main thread.
 * Receives ImageBitmap (transferable), returns alpha mask as
 * Uint8Array (transferable).
 */

import type { PreTrainedModel, Processor } from '@huggingface/transformers'

import { AutoModel, AutoProcessor, env, RawImage } from '@huggingface/transformers'

// ---------------------------------------------------------------------------
// Worker message protocol
// ---------------------------------------------------------------------------

interface LoadRequest {
  type: 'load'
  requestId: string
}

interface ProcessRequest {
  type: 'process'
  requestId: string
  /** Raw image data as RGBA Uint8ClampedArray */
  imageData: Uint8ClampedArray
  width: number
  height: number
}

type WorkerRequest = LoadRequest | ProcessRequest

interface ProgressMessage {
  type: 'progress'
  requestId: string
  progress: number
  message?: string
}

interface LoadedMessage {
  type: 'loaded'
  requestId: string
}

interface ResultMessage {
  type: 'result'
  requestId: string
  /** Alpha mask data, same dimensions as input */
  maskData: Uint8Array
  width: number
  height: number
}

interface ErrorMessage {
  type: 'error'
  requestId: string
  message: string
}

// ---------------------------------------------------------------------------
// Model singleton
// ---------------------------------------------------------------------------

let model: PreTrainedModel | null = null
let processor: Processor | null = null

const MODEL_ID = 'Xenova/modnet'

async function ensureModel(requestId: string): Promise<void> {
  if (model && processor)
    return

  env.backends.onnx.wasm!.proxy = false

  model = await AutoModel.from_pretrained(MODEL_ID, {
    device: 'webgpu',
    progress_callback: (progress: any) => {
      const msg: ProgressMessage = {
        type: 'progress',
        requestId,
        progress: progress?.progress ?? -1,
        message: progress?.status,
      }
      globalThis.postMessage(msg)
    },
  })

  processor = await AutoProcessor.from_pretrained(MODEL_ID, {})
}

// ---------------------------------------------------------------------------
// Processing
// ---------------------------------------------------------------------------

async function processImage(request: ProcessRequest): Promise<void> {
  const { requestId, imageData, width, height } = request

  try {
    await ensureModel(requestId)

    // Create RawImage from the raw pixel data
    const img = new RawImage(imageData, width, height, 4)

    // Pre-process
    const { pixel_values } = await processor!(img)

    // Run inference
    const { output } = await model!({ input: pixel_values })

    // Extract mask and resize to original dimensions
    const mask = await RawImage.fromTensor(
      output[0].mul(255).to('uint8'),
    ).resize(width, height)

    const maskData = new Uint8Array(mask.data.buffer)

    const result: ResultMessage = {
      type: 'result',
      requestId,
      maskData,
      width,
      height,
    }
    // Transfer the buffer to avoid copying
    ;(globalThis as any).postMessage(result, [maskData.buffer])
  }
  catch (error) {
    const msg: ErrorMessage = {
      type: 'error',
      requestId,
      message: error instanceof Error ? error.message : String(error),
    }
    globalThis.postMessage(msg)
  }
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

globalThis.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data

  switch (message.type) {
    case 'load': {
      try {
        await ensureModel(message.requestId)
        const msg: LoadedMessage = {
          type: 'loaded',
          requestId: message.requestId,
        }
        globalThis.postMessage(msg)
      }
      catch (error) {
        const msg: ErrorMessage = {
          type: 'error',
          requestId: message.requestId,
          message: error instanceof Error ? error.message : String(error),
        }
        globalThis.postMessage(msg)
      }
      break
    }
    case 'process':
      await processImage(message)
      break
  }
})
