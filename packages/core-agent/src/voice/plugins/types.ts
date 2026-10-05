import type { AudioRange, AudioWindow, Observer, WindowOptions } from '@proj-airi/pipelines-audio'

import type { BeginSpeechInput, SpeechInputAttemptOutcome } from '../input/attempt-types'
import type { EndDetectionOptions, EndDetector, SpeechActivityEvidence } from '../input/end-detection'
import type { SpeechSelection, SpeechSnapshot } from '../input/snapshot'
import type { TranscriptEdit, WriteResult } from '../input/transcript'
import type { Interruption } from '../interruption'
import type { TurnRef } from '../turn'

/** Keys belong to the current plugin and input. Values remain in-process references. Publishers replace values to signal changes. */
export interface ContextWriter {
  set: <T>(key: string, value: T) => WriteResult
  delete: (key: string) => WriteResult
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
  noteActivity: (evidence: SpeechActivityEvidence) => boolean
  end: () => { status: 'accepted', done: Promise<SpeechInputAttemptOutcome> } | { status: 'denied' }
  cancel: (reason: string) => 'cancelled' | 'closed' | 'denied'
  detectEnd: (options: EndDetectionOptions, detector: EndDetector) => { status: 'installed', observer: Observer } | { status: 'denied' }
}

/** Each command checks both installation grants and the calling task's live ownership. */
export interface VoicePluginControls {
  activeInput: () => SpeechInputControl | undefined
  beginInput: (settings: BeginSpeechInput) => { status: 'started', input: SpeechInputControl } | { status: 'denied' }
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

/** Grants authorize domain operations. They do not sandbox trusted in-process plugins. */
export interface VoicePluginSettings {
  readonly grants?: readonly ('input-control' | 'cancel-input' | 'interrupt-turns' | 'transcript-patch')[]
  readonly dependsOn?: readonly string[]
  readonly onAudioEvidence?: (event: { plugin: string, range: AudioRange, value: unknown }) => void
  readonly onError?: (event: VoicePluginError) => void
}

/** Disposal revokes writes immediately, then waits for registered cleanup. Repeated calls share completion. */
export interface VoicePluginHandle {
  dispose: () => Promise<{ status: 'disposed' } | { status: 'failed', errors: readonly Error[] }>
}
