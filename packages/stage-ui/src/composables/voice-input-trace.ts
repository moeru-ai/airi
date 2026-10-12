import type { Span } from '@opentelemetry/api'
import type { SpeechInputAttempt, SpeechInputAttemptOutcome } from '@proj-airi/core-agent'

import { SpanStatusCode } from '@opentelemetry/api'
import { IOAttributes, IOSpanNames, IOSubsystems } from '@proj-airi/stage-shared'

import { activeVoiceInputSpan, linkComposerVoice, linkVoiceTurn, startSpan } from './use-io-tracer'

/**
 * What started a speech input.
 *
 * - `control`: a voice button, the inlay, or the Push to Talk key.
 * - `speech`: voice activity detection found speech.
 * - `wake-word`: a wake word selected a character.
 */
export type VoiceInputTrigger = 'control' | 'speech' | 'wake-word'

/**
 * Non-speech that ends a traced speech segment. Shorter pauses are breaths inside one segment.
 * The value only shapes the trace. It does not affect when an input ends.
 */
const SEGMENT_PAUSE_MS = 300

interface TracedInput {
  readonly span: Span
  segment?: { span: Span, speechMs: number, silenceMs: number, lastSpeechAt: number }
  /** The session of a composer dictation. Its text returns to the composer instead of a draft. */
  composerSessionId?: string
}

/**
 * Traces the speech inputs of one voice host.
 *
 * Each input gets a `Voice input` span. It is the trace root, or the child of the `Wake word` span that started it.
 * While the input runs, `activeVoiceInputSpan` points to it, so speech recognition, end judgements, and the rephrase
 * become its children. VAD results become `Voice activity detection` child spans, one for each speech segment.
 * The input ID is also the turn ID of the chat turn that its submission starts, so that turn continues the trace.
 *
 * State: `inputs` holds the open inputs by ID. The input outcome ends the input span and its open segment.
 */
export function createVoiceInputTracer() {
  const inputs = new Map<string, TracedInput>()

  /** Starts the trace of an input that the controller has just begun. */
  function start(attempt: Pick<SpeechInputAttempt, 'id' | 'done'>, trigger: VoiceInputTrigger, parent?: Span) {
    const span = startSpan(IOSpanNames.VoiceInput, parent, {
      [IOAttributes.Subsystem]: IOSubsystems.VoiceInput,
      [IOAttributes.VoiceInputId]: attempt.id,
      [IOAttributes.VoiceInputTrigger]: trigger,
    })
    inputs.set(attempt.id, { span })
    activeVoiceInputSpan.value = span
    linkVoiceTurn(attempt.id, span)
    void attempt.done.then(outcome => settle(attempt.id, outcome))
  }

  /**
   * Marks an input as a composer dictation. Its trace then waits for the next turn of the session, because the
   * composer sends the dictated text later under a new message ID.
   */
  function markComposer(inputId: string, sessionId: string) {
    const input = inputs.get(inputId)
    if (input)
      input.composerSessionId = sessionId
  }

  /**
   * Records the VAD result of one window of an input.
   * The first speech window opens a segment. A pause of `SEGMENT_PAUSE_MS` closes it at the time of its last speech window.
   */
  function activity(event: { inputId: string, speech: boolean, durationMs: number }) {
    const input = inputs.get(event.inputId)
    if (!input)
      return

    const now = performance.now()
    if (event.speech) {
      input.segment ??= {
        span: startSpan(IOSpanNames.VoiceActivityDetection, input.span, { [IOAttributes.Subsystem]: IOSubsystems.VAD }),
        speechMs: 0,
        silenceMs: 0,
        lastSpeechAt: now,
      }
      input.segment.speechMs += event.durationMs
      input.segment.silenceMs = 0
      input.segment.lastSpeechAt = now
      return
    }

    if (!input.segment)
      return
    input.segment.silenceMs += event.durationMs
    if (input.segment.silenceMs >= SEGMENT_PAUSE_MS)
      closeSegment(input)
  }

  function closeSegment(input: TracedInput) {
    const segment = input.segment
    if (!segment)
      return
    input.segment = undefined
    segment.span.setAttribute(IOAttributes.VADAudioDurationMs, Math.round(segment.speechMs))
    segment.span.end(segment.lastSpeechAt)
  }

  function settle(inputId: string, outcome: SpeechInputAttemptOutcome) {
    const input = inputs.get(inputId)
    if (!input)
      return
    inputs.delete(inputId)
    closeSegment(input)

    input.span.setAttribute(IOAttributes.VoiceInputOutcome, outcome.status)
    if (outcome.status === 'cancelled')
      input.span.setAttribute(IOAttributes.VoiceInputReason, outcome.reason)
    if (outcome.status === 'failed') {
      input.span.setAttribute(IOAttributes.VoiceInputReason, outcome.stage)
      input.span.setStatus({ code: SpanStatusCode.ERROR, message: outcome.error.message })
    }
    // A dictation that produced text continues in the next composer turn of its session.
    if (input.composerSessionId && outcome.status === 'drafted')
      linkComposerVoice(input.composerSessionId, input.span)
    // A draft that merged into an earlier draft is sent later under that draft's ID.
    else if (outcome.status === 'drafted' && outcome.draftId !== inputId)
      linkVoiceTurn(outcome.draftId, input.span)

    input.span.end()
    if (activeVoiceInputSpan.value === input.span)
      activeVoiceInputSpan.value = undefined
  }

  return { start, markComposer, activity }
}
