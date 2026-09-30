import type { StreamingTranscriber, TranscriptionEvent, TranscriptSegment } from '@proj-airi/core-agent'

import type { HearingTranscriptionResult } from '../providers/transcription-types'

/** Converts provider output into complete transcript revisions. Microphone and conversation policy stay with their owners. */
export class HearingTranscriber implements StreamingTranscriber {
  private readonly words = new Intl.Segmenter(undefined, { granularity: 'word' })
  private readonly sentences = new Intl.Segmenter(undefined, { granularity: 'sentence' })
  constructor(
    readonly capabilities: StreamingTranscriber['capabilities'],
    private readonly invoke: (audio: Parameters<StreamingTranscriber['transcribe']>[0]['audio'], signal: AbortSignal) => Promise<HearingTranscriptionResult>,
  ) {}

  /** Triggering workflow: SpeechInputAttempt capture → provider request → partial revisions and final transcription completion. */
  transcribe(request: Parameters<StreamingTranscriber['transcribe']>[0]): ReadableStream<TranscriptionEvent> {
    const cancelled = new AbortController()
    const signal = AbortSignal.any([request.signal, cancelled.signal])
    let reader: ReadableStreamDefaultReader<import('../providers/stream-transcription').AIRIStreamTranscriptionDelta> | undefined
    let closed = false
    return new ReadableStream<TranscriptionEvent>({
      start: (output) => {
        const fail = (error: unknown) => {
          if (closed)
            return
          closed = true
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
            segments = Array.from(this.sentences.segment(text)).map((sentence, index) => {
              const previous = segments[index]
              if (previous?.text === sentence.segment && previous.final === final)
                return previous
              const tokens = Array.from(this.words.segment(sentence.segment)).filter(word => word.isWordLike).map(word => ({ text: word.segment, start: word.index, end: word.index + word.segment.length }))
              return { id: `speech-${index}`, revision, text: sentence.segment, tokens, final }
            })
            output.enqueue({ type: 'update', revision, segments })
          }
          try {
            signal.throwIfAborted()
            const result = await this.invoke(request.audio, signal)
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
}
