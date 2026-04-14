/**
 * Kokoro TTS Web Worker Entry Point
 *
 * Uses the unified inference protocol from protocol.ts.
 * Domain-specific messages (getVoices) are handled via RunInferenceRequest.
 */

import type {
  ErrorResponse,
  InferenceResultResponse,
  LoadModelRequest,
  ModelReadyResponse,
  ProgressResponse,
  RunInferenceRequest,
  WorkerInboundMessage,
} from '../../libs/inference/protocol'
import type { VoiceKey, Voices } from './types'

import { KokoroTTS } from 'kokoro-js'

import { MODEL_IDS, MODEL_NAMES } from '../../libs/inference/constants'
import { classifyError } from '../../libs/inference/protocol'

// ---------------------------------------------------------------------------
// Inference-specific input/output types
// ---------------------------------------------------------------------------

export interface KokoroGenerateInput {
  action: 'generate'
  text: string
  voice: VoiceKey
}

export interface KokoroGetVoicesInput {
  action: 'getVoices'
}

export type KokoroInferenceInput = KokoroGenerateInput | KokoroGetVoicesInput

export interface KokoroGenerateOutput {
  action: 'generate'
  samples: Float32Array
  samplingRate: number
}

export interface KokoroVoicesOutput {
  action: 'getVoices'
  voices: Voices
}

export type KokoroInferenceOutput = KokoroGenerateOutput | KokoroVoicesOutput

// ---------------------------------------------------------------------------
// Model singleton
// ---------------------------------------------------------------------------

let ttsModel: KokoroTTS | null = null
let currentQuantization: string | null = null
let currentDevice: string | null = null

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
  const { requestId, device, dtype } = request
  const quantization = dtype ?? 'fp32'

  try {
    // Check if we already have the correct model loaded
    if (ttsModel && currentQuantization === quantization && currentDevice === device) {
      const ready: ModelReadyResponse = {
        type: 'model-ready',
        requestId,
        modelId: MODEL_NAMES.KOKORO,
        device: device as 'webgpu' | 'wasm' | 'cpu',
        metadata: { voices: ttsModel.voices },
      }
      globalThis.postMessage(ready)
      return
    }

    // Map webgpu variants to their base dtype (e.g., 'fp16-webgpu' → 'fp16', 'fp32-webgpu' → 'fp32')
    const modelQuantization = quantization.endsWith('-webgpu')
      ? quantization.slice(0, -'-webgpu'.length)
      : quantization

    ttsModel = await KokoroTTS.from_pretrained(
      MODEL_IDS.KOKORO,
      {
        dtype: modelQuantization as 'fp32' | 'fp16' | 'q8' | 'q4' | 'q4f16',
        device: device as 'wasm' | 'webgpu' | 'cpu',
        progress_callback: (progress: any) => {
          const msg: ProgressResponse = {
            type: 'progress',
            requestId,
            payload: {
              phase: 'download',
              // NOTICE: raw.progress from kokoro-js/@huggingface/transformers is already 0-100
              percent: progress?.progress ?? -1,
              message: progress?.status,
              file: progress?.file,
              loaded: progress?.loaded,
              total: progress?.total,
            },
          }
          globalThis.postMessage(msg)
        },
      },
    )

    currentQuantization = quantization
    currentDevice = device

    const ready: ModelReadyResponse = {
      type: 'model-ready',
      requestId,
      modelId: MODEL_NAMES.KOKORO,
      device: device as 'webgpu' | 'wasm' | 'cpu',
      metadata: { voices: ttsModel.voices },
    }
    globalThis.postMessage(ready)
  }
  catch (error) {
    sendError(requestId, error)
  }
}

async function runInference(request: RunInferenceRequest<KokoroInferenceInput>): Promise<void> {
  const { requestId, input } = request

  try {
    if (input.action === 'getVoices') {
      if (!ttsModel)
        throw new Error('Model not loaded. Send load-model first.')

      const result: InferenceResultResponse<KokoroVoicesOutput> = {
        type: 'inference-result',
        requestId,
        output: { action: 'getVoices', voices: ttsModel.voices },
      }
      globalThis.postMessage(result)
      return
    }

    // action === 'generate'
    if (!ttsModel)
      throw new Error('Kokoro TTS generation failed: No model loaded.')

    const { text, voice } = input
    const audioResult = await ttsModel.generate(text, { voice })

    // Transfer raw PCM Float32Array directly — avoids WAV blob encode/decode overhead.
    const samples = audioResult.audio
    const result: InferenceResultResponse<KokoroGenerateOutput> = {
      type: 'inference-result',
      requestId,
      output: { action: 'generate', samples, samplingRate: audioResult.sampling_rate },
    }
    ;(globalThis as any).postMessage(result, [samples.buffer])
  }
  catch (error) {
    sendError(requestId, error)
  }
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

globalThis.addEventListener('message', async (event: MessageEvent<WorkerInboundMessage<KokoroInferenceInput>>) => {
  const message = event.data

  switch (message.type) {
    case 'load-model':
      await loadModel(message)
      break
    case 'run-inference':
      await runInference(message as RunInferenceRequest<KokoroInferenceInput>)
      break
    case 'unload-model':
      ttsModel = null
      currentQuantization = null
      currentDevice = null
      globalThis.postMessage({ type: 'model-unloaded', requestId: message.requestId })
      break
    default:
      console.warn('[Kokoro Worker] Unknown message type:', (message as any).type)
  }
})
