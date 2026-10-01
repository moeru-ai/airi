import type { TurnRef } from '@proj-airi/core-agent'

import type { VoiceMessageSnapshot } from '../../libs/voice/voice-message'

import { defineEventa, defineInvokeEventa } from '@moeru/eventa'
import { createContext as createBroadcastChannelContext } from '@moeru/eventa/adapters/broadcast-channel'

/** Snapshot served by the renderer that owns active speech playback. */
export interface SpeechOutputPlaybackState {
  /** Whether the output host is currently playing assistant speech. */
  speaking: boolean
}

/** Cross-renderer request for the active speech output host's playback state. */
export const speechOutputGetPlaybackState = defineInvokeEventa<SpeechOutputPlaybackState>('eventa:audio:speech:output:get-playback-state')

const BUS_CHANNEL_NAME = 'proj-airi:pipelines:outputs:speech'

let context: ReturnType<typeof createBroadcastChannelContext>['context'] | undefined
let channel: BroadcastChannel | undefined

function getChannel() {
  if (!channel)
    channel = new BroadcastChannel(BUS_CHANNEL_NAME)
  return channel
}

export function getSpeechBusContext() {
  if (!context)
    context = createBroadcastChannelContext(getChannel()).context
  return context
}

/** The audio host supplies identities for responses that still own output or generation. */
export const voiceGetTurns = defineInvokeEventa<readonly TurnRef[]>('eventa:voice:turns')

/** A newly mounted control requests a snapshot. The host also publishes each turn ownership change. */
export const voiceRequestTurns = defineEventa('eventa:voice:request-turns')
export const voiceTurnsChanged = defineEventa<readonly TurnRef[]>('eventa:voice:turns-changed')
/** Generation completion closes downstream speech even when a provider fails before the normal text-end hooks. */
export const voiceGenerationEnded = defineEventa<TurnRef & { status: 'finished' | 'cancelled' | 'failed' }>('eventa:voice:generation-ended')

/** External interruption stops named responses and waits for durable control receipts. */
export const voiceInterrupt = defineInvokeEventa<{ status: 'recorded' | 'failed' }, {
  turns: readonly TurnRef[]
  cause: string
}>('eventa:voice:interrupt')

/** Commands match one source window, producer, session, and turn. A closed producer cannot reopen. */
export type VoiceSpeechCommand = {
  /** Keeps producer IDs from different windows separate. */
  originId: string
  /** Matches later commands to the producer opened by this source. */
  producerId: string
  /** Prevents commands from affecting another conversation turn. */
  turn: TurnRef
} & (
  { type: 'open', purpose: string }
  | { type: 'text' | 'special', value: string }
  | { type: 'end' | 'finish' | 'flush' }
  | { type: 'cancel', reason: string }
)

export const voiceSpeechCommand = defineInvokeEventa<{ status: 'accepted' | 'closed' | 'finished' | 'cancelled' | 'interrupted' | 'failed' }, VoiceSpeechCommand>('eventa:voice:speech')

/** Editable presentation data crosses windows. Plugin context and audio resources stay in the host. */
export interface VoiceDraft {
  readonly id: string
  readonly sessionId: string
  readonly rawText: string
  text: string
}

/** A snapshot replaces earlier presentation state. Commands still target the original request or draft identity. */
export interface VoiceHostSnapshot {
  readonly connected: boolean
  readonly microphone?: { readonly enabled: boolean, readonly ready: boolean, readonly error?: string }
  readonly input?: {
    readonly requestId: string
    readonly sessionId: string
    readonly phase: 'pending' | 'capturing' | 'finalizing' | 'settled'
    readonly text: string
  }
  readonly drafts: readonly VoiceDraft[]
  readonly frontDraftId?: string
  readonly error?: string
}

/** A request ID identifies one recording control. Draft commands use a separate draft ID. */
export type VoiceInputCommand
  = { type: 'begin', requestId: string, sessionId: string }
    | { type: 'end' | 'cancel', requestId: string }
    | { type: 'edit-draft', draftId: string, text: string }
    | { type: 'send-draft' | 'discard-draft' | 'select-draft', draftId: string }

/** The input host owns attempts and drafts. A follower cannot end another control's recording. */
export const voiceInputCommand = defineInvokeEventa<{ status: 'accepted' | 'closed' }, VoiceInputCommand>('eventa:voice:input-command')
export const voiceRequestSnapshot = defineEventa('eventa:voice:request-snapshot')
export const voiceSnapshotChanged = defineEventa<VoiceHostSnapshot>('eventa:voice:snapshot-changed')

/** Recording commands address one session-owned voice message draft. */
export type VoiceMessageCommand
  = { type: 'record', id: string, sessionId: string }
    | { type: 'finish' | 'discard' | 'send', id: string }

/** Completed media uses structured cloning. Live PCM stays on the audio host's source channel. */
export const voiceMessageCommand = defineInvokeEventa<{ status: 'accepted' | 'closed' }, VoiceMessageCommand>('eventa:voice:message-command')
export const voiceMessagesChanged = defineEventa<readonly VoiceMessageSnapshot[]>('eventa:voice:messages-changed')
export const voiceRequestMessages = defineEventa('eventa:voice:request-messages')
