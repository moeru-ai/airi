/**
 * Whisper ASR Web Worker entry point.
 *
 * Speaks the Eventa inference contract (see `libs/inference/contract.ts`).
 * Load is a server-streaming invoke (progress chunks then a terminal `ready`);
 * transcribe is a server-streaming invoke that emits per-token progress updates
 * before the final decoded text.
 */

import type {
  ModelOutput,
  PreTrainedModel,
  PreTrainedTokenizer,
  Processor,
  ProgressCallback,
  Tensor,
} from '@huggingface/transformers'

import type { InferenceDevice, LoadModelRequest, LoadStreamItem, WhisperTranscribeItem, WhisperTranscribeRequest } from '../inference/contract'

import {
  AutoProcessor,
  AutoTokenizer,
  full,
  TextStreamer,
  WhisperForConditionalGeneration,
} from '@huggingface/transformers'
import { defineInvokeHandler, defineStreamInvokeHandler, toStreamHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/webworkers/worker'

import { MODEL_IDS } from '../inference/constants'
import {
  whisperLoadEvent,
  whisperTranscribeEvent,
  whisperUnloadEvent,
} from '../inference/contract'

const { context } = createContext()

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

const MAX_NEW_TOKENS = 64
const MODEL_ID = MODEL_IDS.WHISPER

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

let resolvedDevice: 'webgpu' | 'wasm' | 'cpu' = 'webgpu'

class AutomaticSpeechRecognitionPipeline {
  static model_id: string | null = null
  static tokenizer: Promise<PreTrainedTokenizer>
  static processor: Promise<Processor>
  static model: Promise<PreTrainedModel>

  static async getInstance(progress_callback?: ProgressCallback, device: 'webgpu' | 'wasm' | 'cpu' = 'webgpu') {
    this.model_id = MODEL_ID

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

defineStreamInvokeHandler(context, whisperLoadEvent, toStreamHandler<LoadModelRequest, LoadStreamItem>(async ({ payload, emit }) => {
  const { device } = payload

  emit({ kind: 'progress', payload: { phase: 'download', percent: -1, message: 'Loading model...' } })

  const [_tokenizer, _processor, model] = await AutomaticSpeechRecognitionPipeline.getInstance((x: any) => {
    if (x.status === 'progress') {
      emit({
        kind: 'progress',
        payload: {
          phase: 'download',
          percent: x.progress != null ? Math.round(x.progress * 100) : -1,
          file: x.file,
          loaded: x.loaded,
          total: x.total,
        },
      })
    }
    else if (x.status === 'initiate') {
      emit({ kind: 'progress', payload: { phase: 'download', percent: 0, message: `Loading ${x.file}`, file: x.file } })
    }
  }, device as 'webgpu' | 'wasm' | 'cpu')

  emit({ kind: 'progress', payload: { phase: 'warmup', percent: -1, message: 'Compiling shaders and warming up model...' } })

  // Run model with dummy input to compile WebGPU shaders.
  // NOTICE: Using minimal time-steps (1) instead of 3000 to reduce warm-up latency.
  // The feature dimension (128) must match the encoder's expected mel-spectrogram bins for fp16.
  await model.generate({
    input_features: full([1, 128, 1], 0.0),
    max_new_tokens: 1,
  } as Record<string, unknown>)

  emit({ kind: 'ready', info: { device: resolvedDevice as InferenceDevice } })
}))

let processing = false

defineStreamInvokeHandler(context, whisperTranscribeEvent, toStreamHandler<WhisperTranscribeRequest, WhisperTranscribeItem>(async ({ payload, emit }) => {
  if (processing)
    throw new Error('Worker is busy processing another request')
  processing = true

  try {
    emit({ kind: 'progress', payload: { phase: 'inference', percent: 0, message: 'Starting transcription...' } })

    const audioData = payload.audioFloat32 ?? await base64ToFeatures(payload.audio!)
    const [tokenizer, processor, model] = await AutomaticSpeechRecognitionPipeline.getInstance()

    let startTime: number | undefined
    let numTokens = 0
    const callback_function = (output: ModelOutput | Tensor) => {
      startTime ??= performance.now()

      let tps: number | undefined
      if (numTokens++ > 0) {
        tps = numTokens / (performance.now() - startTime!) * 1000
      }

      emit({ kind: 'progress', payload: { phase: 'inference', percent: -1, output, tps, numTokens } })
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
      language: payload.language,
      streamer,
    })

    const outputText = tokenizer.batch_decode(outputs as Tensor, { skip_special_tokens: true })

    emit({ kind: 'result', text: outputText })
  }
  finally {
    processing = false
  }
}))

defineInvokeHandler(context, whisperUnloadEvent, () => {
  // Whisper uses singleton pattern — can't fully unload, but acknowledge.
})
