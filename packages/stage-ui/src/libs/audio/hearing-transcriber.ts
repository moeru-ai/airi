import type { StreamingTranscriber, TranscriptionEvent, TranscriptSegment } from '@proj-airi/core-agent'
import type { TraceIds } from '@proj-airi/trace-kit'

import type { AIRIStreamTranscriptionDelta } from '../providers/stream-transcription'
import type { HearingTranscriptionResult } from '../providers/transcription-types'

import { errorMessageFrom } from '@moeru/std'
import { beginSpan, TraceEndReasons, trackPath } from '@proj-airi/trace-kit'
import { VoiceAttributes, VoiceIdKeys, VoiceNames, VoiceTracks } from '@proj-airi/trace-kit/voice'

import { activeVoiceInput, getTraceSink } from '../../composables/use-trace'
import { LOCAL_USER_ACTOR } from '../../composables/voice-input-trace'

export interface HearingTranscriberTraceOptions {
  /**
   * The domain IDs of what each recognition transcribes, for example the turn of a voice message.
   *
   * @default the IDs of the voice input that runs now
   */
  ids?: TraceIds
}

/**
 * Converts provider output into complete transcript revisions. Each adapter owns its segmenters and cancellation.
 *
 * Each request records one span on the recognition track of the local user. Completion records the final text, caller
 * abort ends the span as cancelled, and a provider failure ends it with an error. The tracer and audio tests read it.
 */
export function createHearingTranscriber(
  invoke: (audio: Parameters<StreamingTranscriber['transcribe']>[0]['audio'], signal: AbortSignal) => Promise<HearingTranscriptionResult>,
  options: HearingTranscriberTraceOptions = {},
): StreamingTranscriber {
  const words = new Intl.Segmenter(undefined, { granularity: 'word' })
  const sentences = new Intl.Segmenter(undefined, { granularity: 'sentence' })

  function transcribe(request: Parameters<StreamingTranscriber['transcribe']>[0]): ReadableStream<TranscriptionEvent> {
    const cancelled = new AbortController()
    const signal = AbortSignal.any([request.signal, cancelled.signal])
    let reader: ReadableStreamDefaultReader<AIRIStreamTranscriptionDelta> | undefined
    let closed = false
    // Recognition belongs to what it transcribes: the turn that the caller names, such as the turn of a voice
    // message, or else the voice input that runs now. The microphone has one voice input at a time.
    const input = activeVoiceInput.value
    const ids = options.ids ?? (input ? { [VoiceIdKeys.Input]: input.inputId, [VoiceIdKeys.Conversation]: input.sessionId } : undefined)
    const span = beginSpan(getTraceSink(), { track: trackPath(VoiceTracks.ASR, { actor: LOCAL_USER_ACTOR }), name: VoiceNames.SpeechRecognition, ids })

    return new ReadableStream<TranscriptionEvent>({
      start: (output) => {
        const fail = (error: unknown) => {
          if (closed)
            return

          closed = true
          if (request.signal.aborted)
            span.end({ status: 'cancelled', reason: TraceEndReasons.Aborted })
          else
            span.end({ status: 'error', message: errorMessageFrom(error) ?? 'Speech recognition failed' })
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
            span.end({ attrs: { [VoiceAttributes.ASRText]: text } })
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
