/**
 * Kokoro TTS Web Worker entry point.
 *
 * Speaks the Eventa inference contract (see `libs/inference/contract.ts`).
 * Load is a server-streaming invoke (progress chunks then a terminal `ready`);
 * generate is a server-streaming invoke that emits synthesized audio segments.
 */

import type { InferenceDevice, KokoroGenerateChunk, KokoroGenerateRequest, LoadModelRequest, LoadStreamItem } from '../../libs/inference/contract'

import { defineInvokeHandler, defineStreamInvokeHandler, toStreamHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/webworkers/worker'
import { errorMessageFrom } from '@moeru/std'
import { KokoroTTS, TextSplitterStream } from 'kokoro-js'

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
        errorMessageFrom(error) ?? error,
      )
    }
  }

  // All attempts exhausted — propagate to the caller (adapter classifies it).
  throw lastError ?? new Error('All dtype/device combinations failed')
}))

defineStreamInvokeHandler(context, kokoroGenerateEvent, toStreamHandler<KokoroGenerateRequest, KokoroGenerateChunk>(async ({ payload, emit, options }) => {
  if (!ttsModel)
    throw new Error('Kokoro TTS generation failed: No model loaded.')

  const signal = options?.abortController?.signal

  // NOTICE:
  // Why: passing a plain string to `ttsModel.stream(text)` makes the generator
  // hang after the final sentence instead of completing, which trips the
  // adapter's inter-chunk inactivity timeout (no chunk ever follows the last).
  // Root cause: in kokoro-js@1.2.1 the string branch of `stream()` builds an
  // internal TextSplitterStream and `push(...segments)`es the text but never
  // `close()`s it. The splitter's `_process()` holds the final sentence back
  // (waiting on possible trailing context to disambiguate abbreviations), so the
  // `for await` awaits indefinitely after the last yielded sentence.
  // Source: kokoro-js@1.2.1 dist/kokoro.web.js `stream()` (string branch: builds
  // a splitter, pushes, no close). Confirmed by upstream fix hexgrad/kokoro#327
  // (https://github.com/hexgrad/kokoro/pull/327), which adds `splitter.close()`
  // for string input for exactly this reason.
  // Fix: drive an explicit splitter and close() it ourselves (matches #327 and
  // the kokoro-js README streaming example) so the stream terminates.
  // Removal condition: kokoro-js ships #327 (string-input `stream()` self-closes).
  const splitter = new TextSplitterStream()
  const stream = ttsModel.stream(splitter, { voice: payload.voice })
  splitter.push(payload.text)
  splitter.close()

  // Stream synthesized audio segment-by-segment so the main thread can yield the
  // GPU slot between chunks. Abandoning the generator on abort stops synthesis.
  for await (const chunk of stream) {
    if (signal?.aborted)
      return
    emit({ samples: chunk.audio.audio, samplingRate: chunk.audio.sampling_rate })
  }
}))

defineInvokeHandler(context, kokoroUnloadEvent, () => {
  ttsModel = null
  currentQuantization = null
  currentDevice = null
})
