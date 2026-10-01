import type { AudioRange, AudioWindow, Position } from '@proj-airi/pipelines-audio'

/** Stage identifies the external operation that failed. Cancellation is not a provider failure. */
export type SpeechInputAttemptOutcome
  = { readonly status: 'committed', readonly messageId: string }
    | { readonly status: 'drafted', readonly draftId: string }
    | { readonly status: 'cancelled', readonly reason: string }
    | { readonly status: 'failed', readonly stage: 'source' | 'admission' | 'capture' | 'transcription' | 'detector' | 'submission', readonly error: Error }

/** Pending state exists before permission resolves. Finalization frees admission for the next attempt. */
export type SpeechInputAttemptState
  = { readonly phase: 'pending', readonly waitingFor: 'source' | 'silence' }
    | { readonly phase: 'capturing', readonly from: Position }
    | { readonly phase: 'finalizing' }
    | { readonly phase: 'settled', readonly outcome: SpeechInputAttemptOutcome }

/** End detection binds audio evidence to the transcript and activity revisions read by its model. */
export interface TurnEvidence {
  readonly audio: AudioWindow
  readonly transcript: { readonly revision: number, readonly text: string }
  readonly context: { readonly revision: number, readonly messages: readonly { role: string, text: string }[] }
  readonly speechRevision: number
}

/** Ordered detectors need continuous evidence before they end an input. */
export interface EndDetectionOptions {
  readonly windowMs: number
  readonly hopMs: number
  readonly activity: 'ordered' | 'self-contained'
}

export type EndDetector = (evidence: TurnEvidence, signal: AbortSignal) => Promise<'continue' | 'end'>

export interface SpeechActivityEvidence {
  readonly range: AudioRange
  readonly speech: boolean
}
