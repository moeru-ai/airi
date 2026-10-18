import type { PlaybackReceipt } from '@proj-airi/pipelines-audio'

import type { TurnRef } from './turn'

/** Playback silence and durable agent notification have separate completion boundaries. */
export interface Interruption {
  readonly id: string
  readonly silenced: Promise<readonly { readonly turn: TurnRef, readonly status: 'silent' | 'failed', readonly playback?: PlaybackReceipt, readonly error?: Error }[]>
  readonly done: Promise<{ readonly status: 'recorded' | 'failed', readonly notifications: readonly { readonly turn: TurnRef, readonly eventId: string, readonly status: 'acknowledged' | 'queued' | 'failed' }[], readonly error?: Error }>
}

/** Durable external control information travels separately from user-authored chat messages. */
export interface VoiceInterruptionEvent {
  readonly eventId: string
  readonly turn: TurnRef
  readonly cause: string
  readonly playback: PlaybackReceipt
}
