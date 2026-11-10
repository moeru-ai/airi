import type { Eventa } from '@moeru/eventa'
import type { Position } from '@proj-airi/pipelines-audio'

import type { BeginSpeechInput } from '../input/types'
import type { TurnRef } from '../turn'

/**
 * For each evidence kind of one input, the count of its content changes.
 *
 * For example: `{ transcriptText: 7, 'proj-airi:voice:signal:input-activity': 3, context: 12 }`. A count grows only
 * when the content changes, so a provider revision with the same text does not change `transcriptText`. A slow signal
 * result carries the entries that it read in `readAt`. A rule ignores the result when one of these entries changed.
 */
export type InputRevisions = Readonly<Record<string, number>>

/**
 * Eventa metadata that makes a signal count input revisions. `revision` returns the content part of a body.
 * The engine counts a revision for the body's `inputId` when this part changes.
 */
export interface RevisionMetadata<B> {
  readonly revision: (body: B) => unknown
}

/** Commands act on the device. Only the core defines them. */
export type VoiceCommand
  = | { readonly type: 'begin', readonly input: BeginSpeechInput }
    | { readonly type: 'seal', readonly inputId: string, readonly at?: Position }
    | { readonly type: 'cancel', readonly inputId: string, readonly reason: string }
    | { readonly type: 'interrupt', readonly turns: readonly TurnRef[], readonly cause: string }

/** One event that a rule asks the engine to emit. */
export interface Emission<P = unknown> {
  readonly eventa: Eventa<P>
  readonly body: P
}

/** Read-only engine state that a rule can use. */
export interface RuleContext {
  revisions: (inputId: string) => InputRevisions
  /** True when every entry of `readAt` equals the current revision of the input. */
  isCurrent: (inputId: string, readAt: InputRevisions | undefined) => boolean
}

export interface RuleStep<S> {
  readonly state: S
  readonly emit?: readonly Emission[]
  readonly commands?: readonly VoiceCommand[]
}

/**
 * One decision of voice input, as a reducer over voice events.
 *
 * A rule has no timers and no side effects. It reads events and returns its next state, events to emit, and
 * commands. Durations come from the audio ranges of events. A rule can read host settings through its options.
 */
export interface VoiceRule<S> {
  readonly name: string
  initial: () => S
  reduce: (state: S, event: Eventa<unknown>, context: RuleContext) => RuleStep<S>
}
