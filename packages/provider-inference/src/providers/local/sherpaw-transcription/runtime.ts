import type { SherpawSpeechTransport } from '@sherpaw/xsai-transcription'
import type { StreamTranscriptionResult } from '@xsai/stream-transcription'

import type { StreamTranscriptionSnapshot } from '../../../types'
import type { SherpawTranscriptionHost } from './index'
import type { SherpawModel, SherpawModelId } from './models'

import { toFloat32FromPCM16 } from '@proj-airi/audio/encoding'
import { OnlineRecognizerTypes } from '@sherpaw/asr'
import { asRemoteUrl, createSherpawProvider, streamTranscription } from '@sherpaw/xsai-transcription'

import { acceptsHotwords } from './models'
import { joinTranscriptSegments } from './transcript'

export interface SherpawStreamOptions {
  abortSignal?: AbortSignal
  /** Phrases that this request prefers. Only a model that {@link acceptsHotwords} uses them. */
  hotwords?: readonly string[]
  inputAudioStream?: ReadableStream<ArrayBuffer | ArrayBufferView>
  startSherpaw?: (options: SherpawStreamOptions) => SherpawStreamResult
}

export interface SherpawStreamResult extends Omit<StreamTranscriptionResult, 'fullStream'> {
  fullStream: ReadableStream<StreamTranscriptionSnapshot>
}

/**
 * Builds the recognizer fields that bias one request toward the given phrases.
 *
 * Each request creates its own recognizer, so the list applies to this request only.
 * sherpa-onnx applies hotwords only in modified beam search, so a biased request leaves greedy search.
 * The buffer holds one phrase per line, and its size counts UTF-8 bytes.
 * A phrase with a character outside the model's tokens is skipped by sherpa-onnx, and the other phrases still apply.
 *
 * @example
 * hotwordConfig(zipformerMultilingual, ['硫方怪'])
 * // => { decodingMethod: 'modified_beam_search', hotwordsBuf: '硫方怪', hotwordsBufSize: 9 }
 */
function hotwordConfig(model: SherpawModel, hotwords: readonly string[] | undefined) {
  // Line breaks inside a phrase would split it into two hotwords.
  const phrases = hotwords?.map(phrase => phrase.replace(/\s+/g, ' ').trim()).filter(Boolean) ?? []
  if (!phrases.length || !acceptsHotwords(model))
    return {}

  const hotwordsBuf = phrases.join('\n')
  return { decodingMethod: 'modified_beam_search', hotwordsBuf, hotwordsBufSize: new TextEncoder().encode(hotwordsBuf).byteLength }
}

/**
 * Owns the Workers for one configured Provider instance. Each transcription has
 * its own Worker and model memory. Completion, cancellation, or Provider disposal
 * releases that Worker, so model changes cannot reuse an earlier recognizer.
 */
export function createProvider(config: { model: SherpawModelId }, host: SherpawTranscriptionHost) {
  const active = new Set<SherpawSpeechTransport>()

  function startSherpaw(options: SherpawStreamOptions): SherpawStreamResult {
    if (!options.inputAudioStream)
      throw new TypeError('Sherpaw requires a mono PCM16 audio stream at 16000 Hz.')
    options.abortSignal?.throwIfAborted()

    const resource = host.models.find(({ model }) => model.id === config.model)
    if (!resource)
      throw new Error(`Sherpaw model "${config.model}" is not exposed by this application.`)
    const { model, files } = resource
    // Vite resolves bundled URLs. Other entries keep their pinned remote URLs.
    const provider = createSherpawProvider(files.source === 'remote'
      ? { workerURL: host.workerURL, fetch: host.fetchModel }
      : { workerURL: host.workerURL })
    const transport = provider.speech({
      metadata: asRemoteUrl(new URL(files.metadata, document.baseURI), { signal: options.abortSignal }),
      data: asRemoteUrl(new URL(files.data, document.baseURI), { signal: options.abortSignal }),
      sampleRate: 16000,
      recognizerConfig: {
        type: model.recognizer === 'paraformer' ? OnlineRecognizerTypes.Paraformer : OnlineRecognizerTypes.Transducer,
        modelConfig: { modelingUnit: model.modelingUnit },
        ...hotwordConfig(model, options.hotwords),
      },
    })
    if (!transport.events)
      throw new Error('Sherpaw did not provide transcription events.')

    active.add(transport)
    // Sherpaw's text streams append deltas. AIRI needs indexed partials to replace corrections.
    const [executionEvents, snapshotEvents] = transport.events.tee()
    const live = streamTranscription({ ...transport, events: executionEvents })
    void live.fullStream.cancel()
    void live.textStream.cancel()

    const sentences = new Map<number, string>()
    const fullStream = snapshotEvents.pipeThrough(new TransformStream({
      transform(event, controller: TransformStreamDefaultController<StreamTranscriptionSnapshot>) {
        if (event.type === 'transcription.partial')
          sentences.set(event.index, event.text)
        else if (event.type !== 'transcription.completed')
          return

        controller.enqueue({
          type: 'transcript.text.snapshot',
          text: joinTranscriptSegments(sentences.values()),
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
      // The snapshot stream retains corrected partials by sentence index.
      // The finish result covers the last sentence when no partial was emitted.
      return joinTranscriptSegments(sentences.values()) || result.text
    }).catch((error) => {
      if (options.abortSignal?.aborted)
        throw options.abortSignal.reason
      throw error
    }).finally(() => {
      transport.terminateSpeech()
      active.delete(transport)
    })

    return {
      fullStream,
      text,
      // Hearing consumes fullStream snapshots for replacement semantics.
      textStream: new ReadableStream<string>({ start: controller => controller.close() }),
    }
  }

  return {
    transcription(model: string, options: { abortSignal?: AbortSignal, hotwords?: readonly string[] } = {}) {
      return {
        baseURL: 'sherpaw://transcription',
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
