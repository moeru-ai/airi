import type { StreamingTranscriber, TranscriptionEvent, TranscriptSegment } from '@proj-airi/core-agent'

import type { AIRIStreamTranscriptionDelta } from '../providers/stream-transcription'
import type { HearingTranscriptionResult } from '../providers/transcription-types'

import { errorMessageFrom } from '@moeru/std'
import { SpanStatusCode } from '@opentelemetry/api'
import { IOAttributes, IOSpanNames, IOSubsystems } from '@proj-airi/stage-shared'

import { activeTurnSpan, startSpan } from '../../composables/use-io-tracer'

/**
 * Converts provider output into complete transcript revisions. Each adapter owns its segmenters and cancellation.
 *
 * Each request records one speech recognition span. Completion records the final text, caller abort marks
 * the span as aborted, and a provider failure marks it as an error. Devtools and audio tests read this span.
 */
export function createHearingTranscriber(
  invoke: (audio: Parameters<StreamingTranscriber['transcribe']>[0]['audio'], signal: AbortSignal) => Promise<HearingTranscriptionResult>,
): StreamingTranscriber {
  const words = new Intl.Segmenter(undefined, { granularity: 'word' })
  const sentences = new Intl.Segmenter(undefined, { granularity: 'sentence' })

  function transcribe(request: Parameters<StreamingTranscriber['transcribe']>[0]): ReadableStream<TranscriptionEvent> {
    const cancelled = new AbortController()
    const signal = AbortSignal.any([request.signal, cancelled.signal])
    let reader: ReadableStreamDefaultReader<AIRIStreamTranscriptionDelta> | undefined
    let closed = false
    const span = startSpan(IOSpanNames.SpeechRecognition, activeTurnSpan.value, { [IOAttributes.Subsystem]: IOSubsystems.ASR })

    return new ReadableStream<TranscriptionEvent>({
      start: (output) => {
        const fail = (error: unknown) => {
          if (closed)
            return

          closed = true
          if (request.signal.aborted)
            span.setAttribute(IOAttributes.ASRAbort, true)
          else
            span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessageFrom(error) ?? 'Speech recognition failed' })
          span.end()
          output.error(error)
          cancelled.abort(error)
          void reader?.cancel(error).catch(() => {})
        }
        const abort = () => fail(signal.reason)
        signal.addEventListener('abort', abort, { once: true })

        void (async () => {
          let revision = 0
          let text = ''
          let segments: readonly TranscriptSegment[] = []

          const publish = (value: string, final: boolean) => {
            signal.throwIfAborted()
            text = value
            revision += 1
            // Sentence positions preserve unchanged prefix identities. Rewrites revise changed positions and remove missing suffixes.
            segments = Array.from(sentences.segment(text)).map((sentence, index) => {
              const previous = segments[index]
              if (previous?.text === sentence.segment && previous.final === final)
                return previous
              const tokens = Array.from(words.segment(sentence.segment)).filter(word => word.isWordLike).map(word => ({ text: word.segment, start: word.index, end: word.index + word.segment.length }))
              return { id: `speech-${index}`, revision, text: sentence.segment, tokens, final }
            })

            output.enqueue({ type: 'update', revision, segments })
          }

          try {
            signal.throwIfAborted()
            const result = await invoke(request.audio, signal)

            if (result.mode === 'generate') {
              publish(result.text, true)
            }
            else {
              // Provider text can fail before its event stream ends. Observe both paths immediately.
              const finalText = result.text.then(value => ({ value }), (error: unknown) => {
                fail(error)
                return { error }
              })

              void result.textStream.pipeTo(new WritableStream<string>(), { signal }).catch(() => {})
              reader = result.fullStream.getReader()
              if (signal.aborted) {
                await reader.cancel(signal.reason)
                signal.throwIfAborted()
              }

              while (!signal.aborted) {
                const event = await reader.read()
                if (event.done)
                  break
                if (event.value.type === 'transcript.text.delta')
                  publish(text + event.value.delta, false)
                else if (event.value.type === 'transcript.text.snapshot')
                  publish(event.value.text, false)
              }

              const final = await finalText
              if ('error' in final)
                throw final.error
              publish(final.value, true)
            }

            output.enqueue({ type: 'complete', revision })
            closed = true
            span.setAttribute(IOAttributes.ASRText, text)
            span.end()
            output.close()
          }
          catch (error) {
            fail(error)
          }
          finally {
            signal.removeEventListener('abort', abort)
            cancelled.abort('Transcription settled')
            reader?.releaseLock()
          }
        })()
      },
      cancel: reason => cancelled.abort(reason),
    })
  }

  return { transcribe }
}
