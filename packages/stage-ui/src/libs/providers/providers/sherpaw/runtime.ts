import type { SherpawSpeechTransport } from '@sherpaw/xsai-transcription'

import type { AIRIStreamTranscriptionResult, StreamTranscriptionOptions, StreamTranscriptionSnapshot } from '../../stream-transcription'
import type { SherpawLanguageGroup } from './models'

import workerURL from '@sherpaw/xsai-transcription/worker?worker&url'

import { toFloat32FromPCM16 } from '@proj-airi/audio/encoding'
import { sherpawModelPath } from '@proj-airi/vite-plugin-sherpaw/models'
import { OnlineRecognizerTypes } from '@sherpaw/asr'
import { asRemoteUrl, createSherpawProvider, streamTranscription } from '@sherpaw/xsai-transcription'

import { sherpawModels } from './models'

/**
 * Owns the Workers for one configured Provider instance. Each transcription has
 * its own Worker and model memory. Completion, cancellation, or Provider disposal
 * releases that Worker, so language changes cannot reuse an earlier recognizer.
 */
export function createProvider(config: { languageGroup: SherpawLanguageGroup }) {
  const active = new Set<SherpawSpeechTransport>()
  const provider = createSherpawProvider({ workerURL })

  function startSherpaw(options: StreamTranscriptionOptions): AIRIStreamTranscriptionResult {
    if (!options.inputAudioStream)
      throw new TypeError('Sherpaw requires a mono PCM16 audio stream at 16000 Hz.')
    options.abortSignal?.throwIfAborted()

    // Resolve against the application base, not the current settings route.
    // Relative bases also work in Electron's packaged file:// renderer.
    const root = new URL(import.meta.env.BASE_URL, document.baseURI)
    const path = sherpawModelPath(sherpawModels[config.languageGroup])
    const transport = provider.speech({
      metadata: asRemoteUrl(new URL(`${path}/preload.js.metadata`, root), { signal: options.abortSignal }),
      data: asRemoteUrl(new URL(`${path}/preload.data`, root), { signal: options.abortSignal }),
      sampleRate: 16000,
      recognizerConfig: {
        type: config.languageGroup === 'zh-en' ? OnlineRecognizerTypes.Paraformer : OnlineRecognizerTypes.Transducer,
      },
    })
    active.add(transport)
    const live = streamTranscription(transport)
    // AIRI consumes full events. Cancel unused branches rather than buffering
    // duplicate word and sentence events for the duration of a recording.
    void live.streams.partials.cancel()
    void live.streams.words.cancel()
    void live.streams.sentences.cancel()

    const sentences = new Map<number, string>()
    const fullStream = live.streams.full.pipeThrough(new TransformStream({
      transform(event, controller: TransformStreamDefaultController<StreamTranscriptionSnapshot>) {
        if (event.type === 'transcription.partial' || event.type === 'sentence.end')
          sentences.set(event.index, event.text)
        else if (event.type !== 'transcription.completed')
          return

        controller.enqueue({
          type: 'transcript.text.snapshot',
          text: [...sentences.values()].join(' ').trim(),
          isFinal: event.type === 'transcription.completed',
          locale: 'und',
          startMilliseconds: 0,
          durationMilliseconds: 0,
        })
      },
    }))
    const pump = options.inputAudioStream.pipeThrough(new TransformStream({
      transform(chunk: ArrayBuffer | ArrayBufferView, controller) {
        const bytes = ArrayBuffer.isView(chunk)
          ? new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)
          : new Uint8Array(chunk)
        controller.enqueue(toFloat32FromPCM16(bytes))
      },
    })).pipeTo(live.input, { signal: options.abortSignal })

    const text = Promise.all([pump, live.done]).then(([, result]) => {
      // The full-event stream retains corrected partials by sentence index.
      // The finish result covers the last sentence when no partial was emitted.
      return [...sentences.values()].join(' ').trim() || result.text
    }).finally(() => {
      transport.terminateSpeech()
      active.delete(transport)
    })

    return {
      fullStream,
      text,
      // Hearing consumes fullStream snapshots for replacement semantics.
      textStream: new ReadableStream({ start: controller => controller.close() }),
    }
  }

  return {
    transcription(model: string, options: { abortSignal?: AbortSignal } = {}) {
      return {
        baseURL: 'http://sherpaw.local/',
        model,
        ...options,
        startSherpaw,
      }
    },
    dispose() {
      for (const transport of active)
        transport.terminateSpeech()
      active.clear()
    },
  }
}
