/**
 * Kokoro TTS Web Worker entry point.
 *
 * Speaks the Eventa inference contract (see `libs/inference/contract.ts`).
 * Load is a server-streaming invoke (progress chunks then a terminal `ready`);
 * generate is a unary invoke that transfers the raw PCM buffer back zero-copy.
 */

import type { InferenceDevice, LoadModelRequest, LoadStreamItem } from '../../libs/inference/contract'

import { defineInvokeHandler, defineStreamInvokeHandler, toStreamHandler, withTransfer } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/webworkers/worker'
import { KokoroTTS } from 'kokoro-js'

import { MODEL_IDS } from '../../libs/inference/constants'
import {
  kokoroGenerateEvent,
  kokoroLoadEvent,
  kokoroUnloadEvent,
} from '../../libs/inference/contract'

const { context } = createContext()

let ttsModel: KokoroTTS | null = null
let currentQuantization: string | null = null
let currentDevice: string | null = null

// NOTICE: Fallback chains for dtype/device when the requested format is
// unsupported at runtime. Tries progressively lower precision before giving up.
const DTYPE_FALLBACK: Record<string, string[]> = {
  fp16: ['fp32', 'q8', 'q4'],
  fp32: ['q8', 'q4'],
  q8: ['q4', 'fp32'],
  q4: ['q4f16', 'fp32'],
  q4f16: ['q4', 'fp32'],
}

const DEVICE_FALLBACK: Record<string, string[]> = {
  webgpu: ['wasm'],
  wasm: [],
  cpu: [],
}

defineStreamInvokeHandler(context, kokoroLoadEvent, toStreamHandler<LoadModelRequest, LoadStreamItem>(async ({ payload, emit, options }) => {
  const signal = options?.abortController?.signal
  const { device, dtype } = payload
  const quantization = dtype ?? 'fp32'

  if (ttsModel && currentQuantization === quantization && currentDevice === device) {
    emit({ kind: 'ready', info: { device: device as InferenceDevice, metadata: { voices: ttsModel.voices } } })
    return
  }

  const modelQuantization = quantization.endsWith('-webgpu')
    ? quantization.slice(0, -'-webgpu'.length)
    : quantization

  const attempts: Array<{ dtype: string, device: string }> = [
    { dtype: modelQuantization, device },
  ]
  for (const fallbackDtype of (DTYPE_FALLBACK[modelQuantization] ?? []))
    attempts.push({ dtype: fallbackDtype, device })
  for (const fallbackDevice of (DEVICE_FALLBACK[device] ?? []))
    attempts.push({ dtype: modelQuantization, device: fallbackDevice })

  let lastError: unknown
  for (const attempt of attempts) {
    // Client already aborted — stop burning attempts; the invoke is rejected.
    if (signal?.aborted)
      return
    try {
      ttsModel = await KokoroTTS.from_pretrained(
        MODEL_IDS.KOKORO,
        {
          dtype: attempt.dtype as 'fp32' | 'fp16' | 'q8' | 'q4' | 'q4f16',
          device: attempt.device as 'wasm' | 'webgpu' | 'cpu',
          progress_callback: (progress: any) => {
            emit({
              kind: 'progress',
              payload: {
                phase: 'download',
                // NOTICE: raw.progress from kokoro-js/@huggingface/transformers is already 0-100
                percent: progress?.progress ?? -1,
                message: progress?.status,
                file: progress?.file,
                loaded: progress?.loaded,
                total: progress?.total,
              },
            })
          },
        },
      )

      currentQuantization = quantization
      currentDevice = attempt.device

      emit({
        kind: 'ready',
        info: {
          device: attempt.device as InferenceDevice,
          metadata: {
            voices: ttsModel.voices,
            actualDtype: attempt.dtype,
            actualDevice: attempt.device,
          },
        },
      })
      return
    }
    catch (error) {
      lastError = error
      console.warn(
        `[Kokoro Worker] Failed with dtype=${attempt.dtype} device=${attempt.device}, trying next fallback...`,
        error instanceof Error ? error.message : error,
      )
    }
  }

  // All attempts exhausted — propagate to the caller (adapter classifies it).
  throw lastError ?? new Error('All dtype/device combinations failed')
}))

defineInvokeHandler(context, kokoroGenerateEvent, async ({ text, voice }) => {
  if (!ttsModel)
    throw new Error('Kokoro TTS generation failed: No model loaded.')

  const audioResult = await ttsModel.generate(text, { voice })

  // Transfer the raw PCM Float32Array directly — avoids WAV blob encode/decode.
  const samples = audioResult.audio
  return withTransfer({ samples, samplingRate: audioResult.sampling_rate }, [samples.buffer])
})

defineInvokeHandler(context, kokoroUnloadEvent, () => {
  ttsModel = null
  currentQuantization = null
  currentDevice = null
})
