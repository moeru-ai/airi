/**
 * Background removal Web Worker entry point.
 *
 * Runs the Xenova/modnet model inference off the main thread.
 * Speaks the Eventa inference contract (see `libs/inference/contract.ts`):
 * load is a server-streaming invoke (download progress chunks then a terminal
 * `ready`); process is a unary invoke that transfers the raw mask buffer back
 * zero-copy.
 */

import type { PreTrainedModel, Processor } from '@huggingface/transformers'

import type { InferenceDevice, LoadModelRequest, LoadStreamItem } from '../../libs/inference/contract'

import { AutoModel, AutoProcessor, env, RawImage } from '@huggingface/transformers'
import { defineInvokeHandler, defineStreamInvokeHandler, toStreamHandler, withTransfer } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/webworkers/worker'

import { MODEL_IDS } from '../../libs/inference/constants'
import {
  backgroundRemovalLoadEvent,
  backgroundRemovalProcessEvent,
  backgroundRemovalUnloadEvent,
} from '../../libs/inference/contract'

const { context } = createContext()

let model: PreTrainedModel | null = null
let processor: Processor | null = null
let resolvedDevice: InferenceDevice = 'webgpu'

const MODEL_ID = MODEL_IDS.BG_REMOVAL

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

defineStreamInvokeHandler(context, backgroundRemovalLoadEvent, toStreamHandler<LoadModelRequest, LoadStreamItem>(async ({ payload, emit }) => {
  if (model && processor) {
    emit({ kind: 'ready', info: { device: resolvedDevice } })
    return
  }

  let device = payload.device ?? 'webgpu'
  if (device === 'webgpu') {
    const hasWebGPU = await detectWebGPUInWorker()
    if (!hasWebGPU) {
      console.warn('[BG Removal Worker] WebGPU not available, falling back to WASM')
      device = 'wasm'
    }
  }
  resolvedDevice = device

  env.backends.onnx.wasm!.proxy = false

  model = await AutoModel.from_pretrained(MODEL_ID, {
    device,
    progress_callback: (progress: any) => {
      emit({
        kind: 'progress',
        payload: {
          phase: 'download',
          percent: progress?.progress ?? -1,
          message: progress?.status,
        },
      })
    },
  })

  processor = await AutoProcessor.from_pretrained(MODEL_ID, {})

  emit({ kind: 'ready', info: { device: resolvedDevice } })
}))

defineInvokeHandler(context, backgroundRemovalProcessEvent, async ({ imageData, width, height }) => {
  if (!model || !processor)
    throw new Error('Model not loaded. Send load first.')

  const img = new RawImage(imageData, width, height, 4)

  const { pixel_values } = await processor(img)

  const { output } = await model({ input: pixel_values })

  const mask = await RawImage.fromTensor(
    output[0].mul(255).to('uint8'),
  ).resize(width, height)

  const maskData = new Uint8Array(mask.data.buffer)

  // Transfer the mask buffer directly — avoids copying.
  return withTransfer({ maskData, width, height }, [maskData.buffer])
})

defineInvokeHandler(context, backgroundRemovalUnloadEvent, () => {
  model = null
  processor = null
})
