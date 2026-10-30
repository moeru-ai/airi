import type { SpeechInputAttempt, SpeechInputAttemptOutcome, WriteResult } from '@proj-airi/core-agent'
import type { TraceAttributes, TraceSink, TraceSpan } from '@proj-airi/trace-kit'

import type { SpeakerEvidenceUpdate } from '../libs/voice/speaker-evidence-plugin'

import { beginSpan, SeriesWriter, TraceLinkRelations, trackPath } from '@proj-airi/trace-kit'
import { VoiceAttributes, VoiceIdKeys, VoiceNames, VoiceSeries, VoiceTracks } from '@proj-airi/trace-kit/voice'

import { levelOf } from '../libs/voice/input-level'
import { activeVoiceInput, getTraceSink } from './use-trace'

/** The actor ID of the local user in the voice profile. */
export const LOCAL_USER_ACTOR = 'user'

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

/** Chunk length of the window series. Ten records each second keep the live waveform smooth and cost little. */
const LIVE_CHUNK_MS = 100

interface TracedInput {
  readonly span: TraceSpan
  segment?: { span: TraceSpan, speechMs: number, silenceMs: number, lastSpeechAt: number }
  /** The newest speaker evidence, and the updates that the input rejected. */
  speaker?: { update: SpeakerEvidenceUpdate, rejected: number }
}

/** Cosines keep three decimals in a trace. More digits only show float32 noise. */
function roundScore(value: number) {
  return Math.round(value * 1000) / 1000
}

/**
 * Traces the speech inputs of one voice host.
 *
 * Each input gets a span on the input track of the local user, with its input ID. The input ID is also the turn ID of
 * the chat turn that its submission starts, so the chat turn links to the input by that ID. A draft that merged into an
 * earlier draft links to the input of that draft.
 * While the input runs, `activeVoiceInput` holds its ID, so speech recognition, end judgements, and the rephrase carry it.
 * VAD results become speech spans, one for each speech segment. Each detector window adds a VAD probability and a
 * microphone level sample.
 *
 * With speaker recognition on, the input span also gets the speaker score of its speech.
 *
 * State: `inputs` holds the open inputs by ID. The input outcome ends the input span and its open segment.
 */
export function createVoiceInputTracer(sink: () => TraceSink = getTraceSink) {
  const inputs = new Map<string, TracedInput>()
  const actorIds = { [VoiceIdKeys.Actor]: LOCAL_USER_ACTOR }
  const inputTrack = trackPath(VoiceTracks.Input, { actor: LOCAL_USER_ACTOR })
  // The level and the VAD probability of each detector window. The viewer draws the level as the input waveform, and
  // the probability as the opacity of its bars. Short chunks let the live waveform grow smoothly. The
  // writer drops its samples while no viewer shows the input track.
  const windowSeries = new SeriesWriter(sink, { track: inputTrack, ids: actorIds, chunkMs: LIVE_CHUNK_MS })

  /** Records the speech probability and the level of one detector window. */
  function window(channels: readonly Float32Array[], probability: number) {
    windowSeries.push({ [VoiceSeries.Level]: levelOf(channels), [VoiceSeries.Probability]: probability })
  }

  /**
   * Starts the trace of an input that the controller has just begun.
   * `wakeSpanId` is the span of the wake word that began the input. The input links to it as its cause.
   */
  function start(attempt: Pick<SpeechInputAttempt, 'id' | 'sessionId' | 'done'>, trigger: VoiceInputTrigger, wakeSpanId?: string) {
    const span = beginSpan(sink(), {
      track: inputTrack,
      name: VoiceNames.VoiceInput,
      ids: { ...actorIds, [VoiceIdKeys.Input]: attempt.id, [VoiceIdKeys.Conversation]: attempt.sessionId },
      attrs: { [VoiceAttributes.InputTrigger]: trigger },
      ...(wakeSpanId ? { links: [{ rel: TraceLinkRelations.CausedBy, to: { spanId: wakeSpanId } }] } : {}),
    })
    inputs.set(attempt.id, { span })
    activeVoiceInput.value = { inputId: attempt.id, sessionId: attempt.sessionId }
    void attempt.done.then(outcome => settle(attempt.id, outcome))
  }

  /**
   * Records the VAD result of one window of an input.
   * The first speech window opens a segment. A pause of `SEGMENT_PAUSE_MS` closes it at the time of its last speech window.
   */
  function activity(event: { inputId: string, speech: boolean, durationMs: number }) {
    const input = inputs.get(event.inputId)
    if (!input)
      return

    const target = sink()
    const now = target.now()
    if (event.speech) {
      input.segment ??= {
        span: beginSpan(target, {
          track: trackPath(VoiceTracks.Speech, { actor: LOCAL_USER_ACTOR }),
          name: VoiceNames.SpeechSegment,
          ids: { ...actorIds, [VoiceIdKeys.Input]: event.inputId },
          ts: now,
        }),
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

  /**
   * Records an update of the speaker evidence of an input, and the result of its write.
   * The span keeps the newest update, so it shows the score of all counted speech even when the input rejected the update.
   * A rejected update arrived after the transcription had ended, so the submission carried an older score.
   */
  function speakerEvidence(update: SpeakerEvidenceUpdate, result: WriteResult) {
    const input = inputs.get(update.inputId)
    if (!input)
      return
    const rejected = (input.speaker?.rejected ?? 0) + (result.status === 'rejected' ? 1 : 0)
    input.speaker = { update, rejected }
  }

  function closeSegment(input: TracedInput) {
    const segment = input.segment
    if (!segment)
      return
    input.segment = undefined
    // The segment ends at its last speech window. The pause after it is not speech.
    segment.span.end({ ts: segment.lastSpeechAt, attrs: { [VoiceAttributes.SpeechDurationMs]: Math.round(segment.speechMs) } })
  }

  function settle(inputId: string, outcome: SpeechInputAttemptOutcome) {
    const input = inputs.get(inputId)
    if (!input)
      return
    inputs.delete(inputId)
    closeSegment(input)
    // The input ended, so its last samples show now, not with the next chunk.
    windowSeries.flush()

    const attrs: TraceAttributes = { [VoiceAttributes.InputOutcome]: outcome.status }
    if (input.speaker) {
      const { update, rejected } = input.speaker
      attrs[VoiceAttributes.SpeakerScore] = roundScore(update.value.candidates[0].score)
      attrs[VoiceAttributes.SpeakerScores] = update.scores.map(roundScore)
      attrs[VoiceAttributes.SpeakerVoicedMs] = Math.round(update.value.voicedMs)
      attrs[VoiceAttributes.SpeakerRejectedCount] = rejected
    }

    if (outcome.status === 'cancelled') {
      input.span.end({ status: 'cancelled', reason: outcome.reason, attrs })
    }
    else if (outcome.status === 'failed') {
      input.span.end({ status: 'error', reason: outcome.stage, message: outcome.error.message, attrs })
    }
    else if (outcome.status === 'drafted' && outcome.draftId !== inputId) {
      // The merged draft is sent later under the ID of the earlier draft. The link joins this input to that turn.
      input.span.end({ attrs, links: [{ rel: TraceLinkRelations.SameEntity, to: { key: VoiceIdKeys.Input, id: outcome.draftId } }] })
    }
    else {
      input.span.end({ attrs })
    }

    if (activeVoiceInput.value?.inputId === inputId)
      activeVoiceInput.value = undefined
  }

  return { start, activity, speakerEvidence, window }
}
