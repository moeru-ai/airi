import type { Position } from '@proj-airi/pipelines-audio'

import type { TurnRef } from '../turn'

/** The caller selects admission policy and explicit interruption targets. */
export interface BeginSpeechInput {
  readonly sessionId: string
  readonly interruptTurns: readonly TurnRef[]
  readonly start: { readonly kind: 'after-silence' } | { readonly kind: 'speech-onset', readonly at: Position, readonly preRollMs?: number }
}

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
