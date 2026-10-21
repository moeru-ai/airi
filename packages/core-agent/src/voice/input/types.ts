import type { Position } from '@proj-airi/pipelines-audio'

import type { TurnRef } from '../turn'
import type { TranscriptPatch, TranscriptSnapshot } from './transcript'

/** The caller selects admission policy and explicit interruption targets. */
export interface BeginSpeechInput {
  readonly sessionId: string
  /** Why the input began, for example `speech`, `wake-word`, or `control`. Hosts use it for traces. */
  readonly cause?: string
  readonly interruptTurns: readonly TurnRef[]
  readonly start: { readonly kind: 'after-silence' } | { readonly kind: 'speech-onset', readonly at: Position, readonly preRollMs?: number }
}

/** Stage identifies the external operation that failed. Cancellation is not a provider failure. */
export type SpeechInputAttemptOutcome
  = { readonly status: 'committed', readonly messageId: string }
    | { readonly status: 'drafted', readonly draftId: string }
    | { readonly status: 'cancelled', readonly reason: string }
    | { readonly status: 'failed', readonly stage: 'source' | 'admission' | 'capture' | 'transcription' | 'submission', readonly error: Error }

/** Pending state exists before permission resolves. Finalization frees admission for the next attempt. */
export type SpeechInputAttemptState
  = { readonly phase: 'pending', readonly waitingFor: 'source' | 'silence' }
    | { readonly phase: 'capturing', readonly from: Position }
    | { readonly phase: 'finalizing' }
    | { readonly phase: 'settled', readonly outcome: SpeechInputAttemptOutcome }

/** Model scores are evidence, not calibrated identity probabilities. */
export interface SpeakerEvidence {
  readonly revision: number
  readonly candidates: readonly { readonly speakerId: string, readonly score: number }[]
  readonly voicedMs: number
}

/**
 * One version of a speech input, like a text document version in a language server.
 *
 * `version` increases on every change: provider text, a manual correction, or speaker evidence. Work that reads a
 * document is current only while its version is the newest. During capture, `corrected` contains manual corrections
 * only. Plugin corrections apply during finalization, after the provider text is complete.
 */
export interface TranscriptDocument {
  readonly inputId: string
  readonly sessionId: string
  readonly version: number
  readonly raw: TranscriptSnapshot
  readonly corrected: TranscriptSnapshot
  readonly speakers?: SpeakerEvidence
}

/** One value that a finalization stage attached for the host. `plugin` names the stage owner. */
export interface SpeechContextEntry {
  readonly plugin: string
  readonly key: string
  readonly value: unknown
}

/**
 * The final result of one speech input. The host turns it into a chat message or a draft.
 *
 * The controller builds it after transcription completes and every finalization stage settles. `submissionId` is the
 * attempt ID, so the host can deduplicate a retried submission.
 */
export interface SpeechSubmission {
  readonly submissionId: string
  readonly sessionId: string
  /** Corrected text: provider text with manual and plugin corrections. */
  readonly text: string
  readonly transcript: {
    readonly raw: TranscriptSnapshot
    readonly corrected: TranscriptSnapshot
    readonly history: readonly TranscriptSnapshot[]
    readonly patches: readonly TranscriptPatch[]
  }
  readonly context: readonly SpeechContextEntry[]
  readonly speakers?: SpeakerEvidence
}
