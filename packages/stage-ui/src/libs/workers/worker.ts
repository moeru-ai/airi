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
import { errorMessageFrom } from '@moeru/std'

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

// Whisper's encoder consumes a fixed-size log-mel spectrogram: 30 s of audio at
// 100 frames/s = 3000 frames. The time axis is static in the ONNX graph, so any
// input with a different frame count is rejected by OrtRun — warm-up must use
// this exact length (see the warm-up NOTICE).
const WHISPER_N_FRAMES = 3000

/**
 * Mel-filterbank bin count for a Whisper model. large-v3 and large-v3-turbo use
 * 128 bins; every earlier/smaller size (tiny/base/small/medium/large-v1·v2) uses
 * 80. The warm-up dummy input must match this, or OrtRun rejects the encoder input.
 */
function whisperMelBins(modelId: string): number {
  return modelId.includes('large-v3') ? 128 : 80
}

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
  static tokenizer?: Promise<PreTrainedTokenizer>
  static processor?: Promise<Processor>
  static model?: Promise<PreTrainedModel>

  static async getInstance(
    progress_callback?: ProgressCallback,
    device: 'webgpu' | 'wasm' | 'cpu' = 'webgpu',
    // Default to the currently-loaded model so transcribe (which calls without a
    // model id) reuses what load() initialized, falling back to the built-in default.
    modelId: string = this.model_id ?? MODEL_ID,
  ) {
    // Switching models: drop the cached singletons so they re-instantiate for the
    // new repo (downloads are still served from the browser cache when present).
    if (this.model_id != null && this.model_id !== modelId) {
      this.tokenizer = undefined
      this.processor = undefined
      this.model = undefined
    }
    this.model_id = modelId

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
          errorMessageFrom(error) ?? 'unknown error',
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
  const modelId = payload.model ?? MODEL_ID

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
  }, device as 'webgpu' | 'wasm' | 'cpu', modelId)

  emit({ kind: 'progress', payload: { phase: 'warmup', percent: -1, message: 'Compiling shaders and warming up model...' } })

  // Warm up the encoder with a dummy input so WebGPU shaders are compiled before
  // the first real transcription. Best-effort: a warm-up failure must not fail the
  // load — the model is already usable — so it is swallowed and we continue.
  //
  // NOTICE:
  // Why: Whisper's encoder `input_features` has a FIXED shape
  // [batch, n_mels, n_frames] — n_frames is 3000 and n_mels is 128 for large-v3
  // (turbo) or 80 for smaller sizes (see whisperMelBins). The time axis is static
  // in the ONNX graph.
  // Root cause: warming up with [1, 128, 1] (a prior "reduce latency" attempt) makes
  // OrtRun reject the input — "Got invalid dimensions for input: input_features …
  // index 2 Got 1 Expected 3000" — and would not have pre-compiled kernels for the
  // real shape anyway, since WebGPU kernels are shape-specialized.
  // Source: onnx-community Whisper encoder input shapes.
  // Removal condition: keep — the encoder geometry is fixed by the model.
  try {
    await model.generate({
      input_features: full([1, whisperMelBins(modelId), WHISPER_N_FRAMES], 0.0),
      max_new_tokens: 1,
    } as Record<string, unknown>)
  }
  catch (error) {
    console.warn(
      '[Whisper Worker] Warm-up generate failed; continuing without shader pre-compilation:',
      errorMessageFrom(error) ?? 'unknown error',
    )
  }

  emit({ kind: 'ready', info: { device: resolvedDevice as InferenceDevice, metadata: { model: modelId } } })
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
