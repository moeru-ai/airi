import type { AudioInput, PcmBlock, PlaybackReceipt, Position } from '@proj-airi/pipelines-audio'

import type { SpeechOutput } from './response'
import type { SpeakerEvidence, SpeechSnapshot } from './speech-snapshot'
import type { TranscriptionEvent, TranscriptPatch, TranscriptSnapshot } from './transcript'
import type { TurnRef } from './turn'

/**
 * A provider request consumes PCM and produces transcription concurrently.
 *
 * The PCM stream closes when the input ends. Adapters that need a file or a MediaStream convert it themselves.
 */
export interface StreamingTranscriber {
  transcribe: (request: { audio: ReadableStream<PcmBlock>, signal: AbortSignal }) => ReadableStream<TranscriptionEvent>
}

/** Playback silence and durable agent notification have separate completion boundaries. */
export interface Interruption {
  readonly id: string
  readonly silenced: Promise<readonly { readonly turn: TurnRef, readonly status: 'silent' | 'failed', readonly playback?: PlaybackReceipt, readonly error?: Error }[]>
  readonly done: Promise<{ readonly status: 'recorded' | 'failed', readonly notifications: readonly { readonly turn: TurnRef, readonly eventId: string, readonly status: 'acknowledged' | 'queued' | 'failed' }[], readonly error?: Error }>
}

/** The caller selects admission policy and explicit interruption targets. */
export interface BeginSpeechInput {
  readonly sessionId: string
  readonly interruptTurns: readonly TurnRef[]
  readonly start: { readonly kind: 'after-silence' } | { readonly kind: 'speech-onset', readonly at: Position, readonly preRollMs?: number }
}

/** Submission identity is stable across transport retries. The adapter owns persistence. */
export interface SpeechSubmission {
  readonly submissionId: string
  readonly sessionId: string
  readonly text: string
  readonly transcript: {
    readonly raw: TranscriptSnapshot
    readonly corrected: TranscriptSnapshot
    readonly history: readonly TranscriptSnapshot[]
    readonly patches: readonly TranscriptPatch[]
  }
  readonly context: SpeechSnapshot['context']
  readonly speakers?: SpeakerEvidence
}

/** Durable external control information travels separately from user-authored chat messages. */
export interface VoiceInterruptionEvent {
  readonly eventId: string
  readonly turn: TurnRef
  readonly cause: string
  readonly playback: PlaybackReceipt
}

/** Only external source, provider, and persistence boundaries are injected. */
export interface VoiceControllerOptions {
  readonly onError?: (event: { stage: string, error: Error }) => void
  /** Shared input. Attempts and plugins subscribe to it. The controller never closes it. */
  readonly audio?: AudioInput
  readonly transcriber?: (sessionId: string) => StreamingTranscriber
  readonly submit?: (submission: SpeechSubmission, signal: AbortSignal) => Promise<{ status: 'committed', messageId: string } | { status: 'drafted', draftId: string }>
  readonly speech?: (turn: TurnRef) => SpeechOutput
  /** Persistence retries must reuse eventId. This is an agent control event, not a chat message. */
  readonly recordInterruption?: (event: VoiceInterruptionEvent) => Promise<{ status: 'acknowledged' | 'queued' | 'failed' }>
  /** @default 100. Playback uses its audio clock to apply this fade. */
  readonly fadeMs?: number
  readonly conversationContext?: (sessionId: string) => { readonly revision: number, readonly messages: readonly { role: string, text: string }[] }
}
