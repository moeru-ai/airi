import type { Eventa } from '@moeru/eventa'
import type { AudioRange, AudioWindow, Observer, WindowOptions } from '@proj-airi/pipelines-audio'

import type { ConversationContext } from '../input/ports'
import type { TranscriptEdit, WriteResult } from '../input/transcript'
import type { BeginSpeechInput, SpeechInputAttemptOutcome, TranscriptDocument } from '../input/types'
import type { Interruption } from '../interruption'
import type { SpeechOutputEvent } from '../output/response'
import type { InputRevisions, VoiceRule } from '../policy/types'
import type { TurnRef } from '../turn'

/** Commands on one speech input. Each command checks the installation grant and that the calling work is still live. */
export interface SpeechInputControl {
  readonly id: string
  readonly sessionId: string
  end: () => { status: 'accepted', done: Promise<SpeechInputAttemptOutcome> } | { status: 'denied' }
  cancel: (reason: string) => 'cancelled' | 'closed' | 'denied'
}

/** Each command checks both installation grants and the calling work's live ownership. */
export interface VoicePluginControls {
  activeInput: () => SpeechInputControl | undefined
  beginInput: (settings: BeginSpeechInput) => { status: 'started', input: SpeechInputControl } | { status: 'denied' }
  cancelInput: (inputId: string, reason: string) => 'cancelled' | 'closed' | 'denied'
  interrupt: (turns: readonly TurnRef[], cause: string) => { status: 'started', interruption: Interruption } | { status: 'denied' }
}

export interface TranscriptWatchOptions {
  /**
   * The part of the document that the work depends on. A document with an equal key (`Object.is`) does not restart
   * the work. Omission restarts it on every new document version.
   */
  readonly key?: (document: TranscriptDocument) => unknown
  /** Waits until the key stays the same for this long. @default 0 */
  readonly debounceMs?: number
}

/**
 * Work on the complete transcript, after the provider ends and before the host receives the submission.
 *
 * Stages run one after another, in plugin installation order, then registration order. Each stage sees the
 * corrections of earlier stages in `document.corrected`.
 */
export interface FinalizeContext {
  readonly document: TranscriptDocument
  /** Aborts when the stage times out or the input closes. Writes after the abort are rejected. */
  readonly signal: AbortSignal
  /** Applies corrections to raw segments. `expectedText` must match the raw text of each edited range. */
  patch: (edits: readonly TranscriptEdit[], evidenceIds?: readonly string[]) => WriteResult
  /** Adds a value to the submission context. A later value with the same key from this plugin replaces it. */
  attach: (key: string, value: unknown) => WriteResult
}

export interface FinalizeOptions {
  /**
   * Submission waits at most this long for the stage. Then the stage aborts and submission continues without
   * its later writes. Omission waits until the stage ends.
   */
  readonly timeoutMs?: number
}

/** This plugin's scope for one accepted input. Its signal aborts when the input closes or the plugin is disposed. */
export interface SpeechInputScope {
  readonly inputId: string
  readonly sessionId: string
  readonly signal: AbortSignal
  /** The input commands, or undefined without the `input-control` grant. */
  readonly control: SpeechInputControl | undefined
  /**
   * Runs `run` for the newest document while the provider transcribes, like a language server analysis.
   *
   * A newer key aborts the active run. The first run sees the document at registration time. Use it for
   * speculative work, for example a rewrite that a finalization stage reuses when the text did not change.
   */
  watch: (run: (document: TranscriptDocument, signal: AbortSignal) => Promise<void> | void, options?: TranscriptWatchOptions) => void
  finalize: (stage: (ctx: FinalizeContext) => Promise<void> | void, options?: FinalizeOptions) => void
  onDispose: (cleanup: () => void | Promise<void>) => void
}

/** This plugin's scope for one response that speaks. Its signal aborts when the response closes or the plugin is disposed. */
export interface SpeechOutputScope {
  readonly turn: TurnRef
  readonly signal: AbortSignal
  /** Commands that check the grants of the plugin, for example `interrupt` with `interrupt-turns`. */
  readonly controls: VoicePluginControls
  /** Receives the speech events of one type, in order, until the response closes. */
  on: <T extends SpeechOutputEvent['type']>(type: T, listener: (event: Extract<SpeechOutputEvent, { type: T }>) => void) => void
  onDispose: (cleanup: () => void | Promise<void>) => void
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

/**
 * Windows of one side of the audio, for the whole life of the plugin.
 *
 * When the host replaces the device, for example the microphone or the playback, the observation moves to the new one.
 */
export interface VoicePluginAudio {
  observe: (
    settings: WindowOptions & { minWindowMs?: number },
    run: (ctx: AudioPluginTask) => Promise<void>,
  ) => Observer
}

/** The played side. `connect` exists only on a host whose playback has a platform audio graph. */
export interface VoicePluginOutputAudio<TNode> extends VoicePluginAudio {
  /**
   * Connects a node of the platform graph, for example an `AudioNode`, to the played audio until the plugin is disposed.
   * A replaced playback moves the connection to the new playback.
   */
  readonly connect?: (node: TNode) => void
}

/**
 * Plugin installation exposes scoped operations, not the mutable controller or source.
 *
 * Each stage of a turn has its own `onXxx` hook, which runs once for each occurrence. `input` and `output` give the
 * audio itself for the whole life of the plugin. `TNode` is the node type of the platform audio graph. A plugin that
 * needs no graph keeps `never` and installs on every host.
 */
export interface VoicePluginScope<TNode = never> {
  readonly signal: AbortSignal
  /** The microphone or another shared input. */
  readonly input: VoicePluginAudio
  /** The played speech. */
  readonly output: VoicePluginOutputAudio<TNode>
  /**
   * Runs `install` for each accepted input, in plugin installation order. `install` can be asynchronous.
   * Finalization waits for pending installs, so a stage that an install registers late still runs.
   */
  onInput: (install: (ctx: SpeechInputScope) => void | Promise<void>) => void
  /** Runs `install` for each response that opens speech, in plugin installation order. */
  onOutput: (install: (ctx: SpeechOutputScope) => void | Promise<void>) => void
  /**
   * Emits a voice event, usually a signal that this plugin defines with `defineEventa`.
   * Emits after disposal are dropped.
   */
  emit: <P>(eventa: Eventa<P>, body: P) => void
  /** Receives voice events of one definition. Disposal removes the listener. */
  on: <P>(eventa: Eventa<P>, listener: (body: P) => void) => void
  /** Adds a voice rule. Disposal removes it. Rules run in the order that plugins add them. */
  rule: <S>(rule: VoiceRule<S>) => void
  /** The current revisions of an input. A slow signal reads them before its work and returns them as `readAt`. */
  revisions: (inputId: string) => InputRevisions
  conversationContext: (sessionId: string) => ConversationContext
  cancel: (reason: string) => void
  fail: (error: Error) => void
  onDispose: (cleanup: () => void | Promise<void>) => void
}

/** Setup is synchronous. Cleanup releases only resources that this installation owns. */
export interface VoicePlugin<TNode = never> {
  readonly name: string
  setup: (ctx: VoicePluginScope<TNode>) => undefined | (() => void | Promise<void>)
}

/** Errors include ownership so the host can apply its own required or optional feature policy. */
export interface VoicePluginError {
  readonly plugin: string
  readonly inputId?: string
  /** The response of an `output` error. */
  readonly turn?: TurnRef
  readonly stage: 'setup' | 'input' | 'watch' | 'finalize' | 'audio' | 'output' | 'cleanup'
  readonly error: Error
}

/** Grants authorize control operations. Plugins are trusted in-process code, so grants are not a sandbox. */
export interface VoicePluginSettings {
  readonly grants?: readonly ('input-control' | 'cancel-input' | 'interrupt-turns')[]
  readonly onAudioEvidence?: (event: { plugin: string, range: AudioRange, value: unknown }) => void
  readonly onError?: (event: VoicePluginError) => void
}

/** Disposal revokes writes immediately, then waits for registered cleanup. Repeated calls share completion. */
export interface VoicePluginHandle {
  dispose: () => Promise<{ status: 'disposed' } | { status: 'failed', errors: readonly Error[] }>
}
