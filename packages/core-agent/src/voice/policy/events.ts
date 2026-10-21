import type { AudioRange, Position } from '@proj-airi/pipelines-audio'

import type { BeginSpeechInput, SpeechInputAttemptOutcome } from '../input/types'
import type { TurnRef } from '../turn'
import type { InputRevisions, RevisionMetadata } from './types'

import { defineEventa } from '@moeru/eventa'

// Input lifecycle events. Only the voice controller emits them.

export const inputBegunEvent = defineEventa<{ inputId: string, sessionId: string, start: BeginSpeechInput['start'], cause?: string }>('proj-airi:voice:input:begun')
export const inputCapturingEvent = defineEventa<{ inputId: string, from: Position }>('proj-airi:voice:input:capturing')
/** Raw provider text. The engine counts a `transcriptText` revision only when the text changes. */
export const inputTranscriptEvent = defineEventa<{ inputId: string, text: string }>('proj-airi:voice:input:transcript')
export const inputFinalizingEvent = defineEventa<{ inputId: string }>('proj-airi:voice:input:finalizing')
export const inputSettledEvent = defineEventa<{ inputId: string, outcome: SpeechInputAttemptOutcome }>('proj-airi:voice:input:settled')

// First-party signals. Any plugin can define more signals with `defineEventa`.

/** One VAD window. `accepted` and `wake` exist only when the detector evaluated them for this window. */
export const speechActivitySignal = defineEventa<{
  range: AudioRange
  durationMs: number
  score: number
  discontinuity: boolean
  /** The echo gate result. The detector evaluates it only for a window that can begin an input. */
  accepted?: boolean
  wake?: { sessionId: string, interruptTurns: readonly TurnRef[] }
}>('proj-airi:voice:signal:speech-activity')

/** One VAD window that the activity rule accepted for its input. Its revision changes when speech starts or stops. */
export const inputActivitySignal = defineEventa<{ inputId: string, range: AudioRange, speech: boolean, durationMs: number }, RevisionMetadata<{ speech: boolean }>>(
  'proj-airi:voice:signal:input-activity',
  { metadata: { revision: body => body.speech } },
)

/** The speaker paused after speech, with transcript text. `readAt` holds the revisions of that moment. */
export const pausedSignal = defineEventa<{ inputId: string, sessionId: string, text: string, readAt: InputRevisions }>('proj-airi:voice:signal:paused')

/** A model judgement of a paused input. It is current only while `readAt` matches the input revisions. */
export const endJudgedSignal = defineEventa<{ inputId: string, result: 'complete' | 'incomplete', readAt: InputRevisions }>('proj-airi:voice:signal:end-judged')
