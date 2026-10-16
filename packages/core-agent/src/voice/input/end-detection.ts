import type { AudioRange, AudioWindow } from '@proj-airi/pipelines-audio'

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
