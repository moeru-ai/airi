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

import { errorMessageFromValue } from '@proj-airi/stage-shared'
import { KokoroTTS } from 'kokoro-js'

import { MODEL_IDS, MODEL_NAMES } from '../../libs/inference/constants'
import { classifyError, isRecoverable } from '../../libs/inference/protocol'

// ---------------------------------------------------------------------------
// Inference-specific input/output types
// ---------------------------------------------------------------------------

export interface KokoroGenerateInput {
  action: 'generate'
  text: string
  voice: VoiceKey
}

export interface KokoroGenerateOutput {
  action: 'generate'
  samples: Float32Array
  samplingRate: number
}

export interface KokoroGetVoicesInput {
  action: 'getVoices'
}

export type KokoroInferenceInput = KokoroGenerateInput | KokoroGetVoicesInput

export type KokoroInferenceOutput = KokoroGenerateOutput | KokoroVoicesOutput

export interface KokoroVoicesOutput {
  action: 'getVoices'
  voices: Voices
}

// ---------------------------------------------------------------------------
// Model singleton
// ---------------------------------------------------------------------------

let ttsModel: KokoroTTS | null = null
let currentQuantization: null | string = null
let currentDevice: null | string = null

// NOTICE: Fallback chains for dtype/device when the requested format is
// unsupported at runtime. Tries progressively lower precision before giving up.
const DTYPE_FALLBACK: Record<string, string[]> = {
  fp16: ['fp32', 'q8', 'q4'],
  fp32: ['q8', 'q4'],
  q4: ['q4f16', 'fp32'],
  q4f16: ['q4', 'fp32'],
  q8: ['q4', 'fp32'],
}

const DEVICE_FALLBACK: Record<string, string[]> = {
  cpu: [],
  wasm: [],
  webgpu: ['wasm'],
}

// NOTICE: Cancellation tracking — see Whisper worker for the full rationale.
// We cannot interrupt a transformers.js call synchronously; this set lets us
// drop stale results when they arrive.
const cancelledRequestIds = new Set<string>()

function clearCancelled(requestId: string): void {
  cancelledRequestIds.delete(requestId)
}

function isCancelled(requestId: string): boolean {
  return cancelledRequestIds.has(requestId)
}

async function loadModel(request: LoadModelRequest): Promise<void> {
  const { device, dtype, requestId } = request
  const quantization = dtype ?? 'fp32'

  try {
    // Check if we already have the correct model loaded
    if (ttsModel && currentQuantization === quantization && currentDevice === device) {
      if (isCancelled(requestId)) {
        clearCancelled(requestId)
        return
      }
      const ready: ModelReadyResponse = {
        device: device as 'cpu' | 'wasm' | 'webgpu',
        metadata: { voices: ttsModel.voices },
        modelId: MODEL_NAMES.KOKORO,
        requestId,
        type: 'model-ready',
      }
      globalThis.postMessage(ready)
      return
    }

    // Map webgpu variants to their base dtype (e.g., 'fp16-webgpu' → 'fp16', 'fp32-webgpu' → 'fp32')
    const modelQuantization = quantization.endsWith('-webgpu')
      ? quantization.slice(0, -'-webgpu'.length)
      : quantization

    // Build ordered list of (dtype, device) pairs to attempt
    const attempts: Array<{ device: string, dtype: string }> = [
      { device, dtype: modelQuantization },
    ]
    for (const fallbackDtype of (DTYPE_FALLBACK[modelQuantization] ?? []))
      attempts.push({ device, dtype: fallbackDtype })
    for (const fallbackDevice of (DEVICE_FALLBACK[device] ?? []))
      attempts.push({ device: fallbackDevice, dtype: modelQuantization })

    let lastError: unknown
    for (const attempt of attempts) {
      try {
        ttsModel = await KokoroTTS.from_pretrained(
          MODEL_IDS.KOKORO,
          {
            device: attempt.device as 'cpu' | 'wasm' | 'webgpu',
            dtype: attempt.dtype as 'fp16' | 'fp32' | 'q4' | 'q4f16' | 'q8',
            progress_callback: (progress: any) => {
              const msg: ProgressResponse = {
                payload: {
                  file: progress?.file,
                  loaded: progress?.loaded,
                  message: progress?.status,
                  // NOTICE: raw.progress from kokoro-js/@huggingface/transformers is already 0-100
                  percent: progress?.progress ?? -1,
                  phase: 'download',
                  total: progress?.total,
                },
                requestId,
                type: 'progress',
              }
              globalThis.postMessage(msg)
            },
          },
        )

        currentQuantization = quantization
        currentDevice = attempt.device

        if (isCancelled(requestId)) {
          clearCancelled(requestId)
          return
        }
        const ready: ModelReadyResponse = {
          device: attempt.device as 'cpu' | 'wasm' | 'webgpu',
          metadata: {
            actualDevice: attempt.device,
            actualDtype: attempt.dtype,
            voices: ttsModel.voices,
          },
          modelId: MODEL_NAMES.KOKORO,
          requestId,
          type: 'model-ready',
        }
        globalThis.postMessage(ready)
        return
      }
      catch (error) {
        lastError = error
        console.warn(
          `[Kokoro Worker] Failed with dtype=${attempt.dtype} device=${attempt.device}, trying next fallback...`,
          errorMessageFromValue(error),
        )
      }
    }

    // All attempts exhausted
    if (isCancelled(requestId))
      clearCancelled(requestId)
    else
      sendError(requestId, lastError ?? new Error('All dtype/device combinations failed'), 'load')
  }
  catch (error) {
    if (isCancelled(requestId))
      clearCancelled(requestId)
    else
      sendError(requestId, error, 'load')
  }
}

function markCancelled(targetRequestId: string): void {
  cancelledRequestIds.add(targetRequestId)
  const msg: ErrorResponse = {
    payload: {
      code: 'CANCELLED',
      message: 'Operation cancelled by caller',
      recoverable: false,
    },
    requestId: targetRequestId,
    type: 'error',
  }
  globalThis.postMessage(msg)
}

async function runInference(request: RunInferenceRequest<KokoroInferenceInput>): Promise<void> {
  const { input, requestId } = request

  try {
    if (input.action === 'getVoices') {
      if (!ttsModel)
        throw new Error('Model not loaded. Send load-model first.')

      if (isCancelled(requestId)) {
        clearCancelled(requestId)
        return
      }

      const result: InferenceResultResponse<KokoroVoicesOutput> = {
        output: { action: 'getVoices', voices: ttsModel.voices },
        requestId,
        type: 'inference-result',
      }
      globalThis.postMessage(result)
      return
    }

    // action === 'generate'
    if (!ttsModel)
      throw new Error('Kokoro TTS generation failed: No model loaded.')

    const { text, voice } = input
    const audioResult = await ttsModel.generate(text, { voice })

    if (isCancelled(requestId)) {
      clearCancelled(requestId)
      return
    }

    // Transfer raw PCM Float32Array directly — avoids WAV blob encode/decode overhead.
    const samples = audioResult.audio
    const result: InferenceResultResponse<KokoroGenerateOutput> = {
      output: { action: 'generate', samples, samplingRate: audioResult.sampling_rate },
      requestId,
      type: 'inference-result',
    }
    ;(globalThis as any).postMessage(result, [samples.buffer])
  }
  catch (error) {
    if (isCancelled(requestId))
      clearCancelled(requestId)
    else
      sendError(requestId, error, 'inference')
  }
}

function sendError(requestId: string, error: unknown, phase?: 'inference' | 'load'): void {
  const message = errorMessageFromValue(error)
  const code = classifyError(error, phase)
  const msg: ErrorResponse = {
    payload: {
      code,
      message,
      recoverable: isRecoverable(code),
    },
    requestId,
    type: 'error',
  }
  globalThis.postMessage(msg)
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

globalThis.addEventListener('message', async (event: MessageEvent<WorkerInboundMessage<KokoroInferenceInput>>) => {
  const message = event.data

  switch (message.type) {
    case 'cancel':
      markCancelled(message.targetRequestId)
      break
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
      globalThis.postMessage({ requestId: message.requestId, type: 'model-unloaded' })
      break
    default:
      console.warn('[Kokoro Worker] Unknown message type:', (message as any).type)
  }
})
