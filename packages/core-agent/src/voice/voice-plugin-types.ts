import type { AudioWindow, Observer, WindowOptions } from '@proj-airi/pipelines-audio'

import type { SpeechInputAttempt } from './speech-input-attempt'
import type { TranscriptSegment } from './transcript'
import type { VoiceController as BaseVoiceController, Interruption, TurnRef } from './voice-controller'

/** Model scores are evidence, not calibrated identity probabilities. */
export interface SpeakerEvidence {
  readonly revision: number
  readonly candidates: readonly { readonly speakerId: string, readonly score: number }[]
  readonly voicedMs: number
}

/** Selection fixes the data that a task reads and the dependencies of its writes. */
export interface SpeechSelection {
  readonly transcript: 'raw' | 'corrected'
  readonly speakers?: boolean
  readonly context?: readonly { readonly plugin: string, readonly key: string, readonly scope?: 'input' | 'target-segment' }[]
  /** Limits automatic corrections in corrected views. Manual corrections are always included. */
  readonly correctionPlugins?: readonly string[]
  readonly scope?: 'document' | { readonly kind: 'segment', readonly neighbors: number, readonly neighborTranscript?: 'raw' | 'corrected' }
}

/** Each snapshot belongs to one input. Segment selection includes explicit neighboring segments. */
export interface SpeechSnapshot {
  readonly inputId: string
  readonly sessionId: string
  readonly transcript: {
    readonly view: 'raw' | 'corrected'
    readonly revision: number
    readonly text: string
    readonly segments: readonly TranscriptSegment[]
    readonly targetSegmentId?: string
  }
  readonly speakers?: SpeakerEvidence
  readonly neighbors: readonly { readonly view: 'raw' | 'corrected', readonly segment: TranscriptSegment }[]
  readonly correctionPlugins: readonly string[]
  readonly context: readonly { readonly plugin: string, readonly key: string, readonly segmentId?: string, readonly revision: number, readonly value?: unknown }[]
}

/** A write never starts another asynchronous operation. It checks and changes state synchronously. */
export type WriteResult
  = { readonly status: 'applied' }
    | { readonly status: 'rejected', readonly reason: 'stale' | 'closed' | 'conflict' | 'denied' }

/** Keys belong to the current plugin and input. Values remain in-process references. Publishers replace values to signal changes. */
export interface ContextWriter {
  set: <T>(key: string, value: T) => WriteResult
  delete: (key: string) => WriteResult
}

/** Edits refer to raw tokens from the task snapshot. The runtime supplies their dependency versions. */
export interface TranscriptEdit {
  readonly segmentId: string
  readonly range: { readonly kind: 'tokens', readonly start: number, readonly end: number } | { readonly kind: 'segment' }
  readonly expectedText: string
  readonly replacement: string
}

/** This view expires when its task ends. Detached callbacks cannot publish through it. */
export interface SpeechView {
  readonly snapshot: SpeechSnapshot
  readonly context: ContextWriter
  patch: (proposal: { readonly edits: readonly TranscriptEdit[], readonly evidenceIds: readonly string[] }) => WriteResult
}

/** Cancellation closes this invocation. Failure also stops its subscription and reports to the host. */
export interface SpeechTask extends SpeechView {
  readonly controls: VoicePluginControls
  readonly signal: AbortSignal
  cancel: (reason: string) => void
  fail: (error: Error) => void
}

/** A completed transcription is independent of plugin completion and message submission. */
export type TranscriptionEnd
  = { readonly status: 'finished', readonly value: SpeechView }
    | { readonly status: 'cancelled', readonly reason: string }
    | { readonly status: 'failed', readonly error: Error }

/** A lifecycle task can wait without occupying a transcript subscription's active slot. */
export interface SpeechLifecycleTask {
  readonly controls: VoicePluginControls
  readonly signal: AbortSignal
  untilTranscriptionEnded: () => Promise<TranscriptionEnd>
  /** Waits for transcription and the expanded upstream plugin-input scopes to settle successfully. */
  untilDependenciesSettled: () => Promise<TranscriptionEnd>
  cancel: (reason: string) => void
  fail: (error: Error) => void
}

/** Subscription handles cancel only their own work. Operational results resolve rather than reject. */
export interface SpeechSubscription {
  readonly done: Promise<{ status: 'finished' } | { status: 'cancelled', reason: string } | { status: 'failed', error: Error }>
  cancel: (reason: string) => void
}

/** This plugin's scope for one accepted input. Installation is synchronous and precedes the first update. */
export interface SpeechInputScope {
  readonly inputId: string
  readonly sessionId: string
  readonly signal: AbortSignal
  readonly state: Map<string, unknown>
  subscribe: (settings: SpeechSelection & {
    scheduling: 'latest' | 'ordered'
    /** Optional timeout from callback start. Omission adds no timeout. */
    timeoutMs?: number
    /** @default 0. Final draining can delay submission within this caller-selected grace period. */
    waitForSubmissionMs?: number
  }, run: (ctx: SpeechTask) => Promise<void>) => SpeechSubscription
  task: (settings: {
    name: string
    selection: SpeechSelection & { scope?: 'document' }
    /** Optional timeout for the entire task, including waits. Omission adds no timeout. */
    timeoutMs?: number
    /** @default 0. A positive value delays submission after transcription for at most this many milliseconds. */
    waitForSubmissionMs?: number
  }, run: (ctx: SpeechLifecycleTask) => Promise<void>) => SpeechSubscription
  /** Stops this plugin's work for this input. It does not cancel the input itself. */
  cancel: (reason: string) => void
  fail: (error: Error) => void
  onDispose: (cleanup: () => void | Promise<void>) => void
}

/** Task-bound attempt access never exposes an unrestricted input handle. */
export interface SpeechInputControl {
  readonly id: string
  readonly sessionId: string
  noteActivity: SpeechInputAttempt['noteActivity']
  end: () => { status: 'accepted', done: SpeechInputAttempt['done'] } | { status: 'denied' }
  cancel: (reason: string) => 'cancelled' | 'closed' | 'denied'
  detectEnd: (...args: Parameters<SpeechInputAttempt['detectEnd']>) => { status: 'installed', observer: Observer } | { status: 'denied' }
}

/** Each command checks both installation grants and the calling task's live ownership. */
export interface VoicePluginControls {
  activeInput: () => SpeechInputControl | undefined
  beginInput: (settings: Parameters<BaseVoiceController['beginInput']>[0]) => { status: 'started', input: SpeechInputControl } | { status: 'denied' }
  cancelInput: (inputId: string, reason: string) => 'cancelled' | 'closed' | 'denied'
  interrupt: (turns: readonly TurnRef[], cause: string) => { status: 'started', interruption: Interruption } | { status: 'denied' }
}

/** Audio callbacks have plugin ownership and cancellation. They cannot change transcript documents. */
export interface AudioPluginTask {
  readonly controls: VoicePluginControls
  readonly window: AudioWindow
  readonly signal: AbortSignal
  /** Sends source-tagged evidence to the host before task completion. Late publication is rejected. */
  publish: <T>(value: T) => WriteResult
  cancel: (reason: string) => void
  fail: (error: Error) => void
}

/** Plugin installation exposes scoped operations, not the mutable controller or source. */
export interface VoicePluginScope {
  readonly signal: AbortSignal
  readonly state: Map<string, unknown>
  observeAudio: (settings: WindowOptions & { minWindowMs?: number }, run: (ctx: AudioPluginTask) => Promise<void>) => Observer
  onSpeechInput: (install: (ctx: SpeechInputScope) => undefined | (() => void | Promise<void>)) => void
  cancel: (reason: string) => void
  fail: (error: Error) => void
  onDispose: (cleanup: () => void | Promise<void>) => void
}

/** Setup is synchronous. Cleanup releases only resources that this installation owns. */
export interface VoicePlugin {
  readonly name: string
  setup: (ctx: VoicePluginScope) => undefined | (() => void | Promise<void>)
}

/** Errors include ownership so the host can apply its own required or optional feature policy. */
export interface VoicePluginError {
  readonly plugin: string
  readonly inputId?: string
  readonly stage: 'setup' | 'subscription' | 'task' | 'dependency' | 'cleanup'
  readonly error: Error
}

/** Disposal revokes writes immediately, then waits for registered cleanup. Repeated calls share completion. */
export interface VoicePluginHandle {
  dispose: () => Promise<{ status: 'disposed' } | { status: 'failed', errors: readonly Error[] }>
}
