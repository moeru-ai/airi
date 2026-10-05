/** Proposed contracts only. This file has no runtime implementation or package exports. */
export interface Position {
  readonly sourceId: string
  readonly frame: number
}

/** The interval is half-open. A new source connection receives a new sourceId. */
export interface AudioRange {
  readonly sourceId: string
  readonly startFrame: number
  readonly endFrame: number
}

/** Each channel contains owned, planar float32 samples. Consumers must not mutate the samples. */
export interface PcmBlock {
  readonly range: AudioRange
  readonly sampleRate: number
  readonly channels: readonly Float32Array[]
}

/** Copies remain valid for the detector call. A gap resets overlap before the next complete window. */
export interface AudioWindow extends PcmBlock {
  readonly discontinuity: boolean
}

/**
 * A microphone, a borrowed MediaStream, or a decoded file.
 * Each open call is one connection. Aborting its signal releases what that call opened.
 * Open starts permission work synchronously, so a click handler can start a microphone.
 */
export interface AudioInputSource {
  open: (signal: AbortSignal) => ReadableStream<PcmBlock>
}

/** Operational failures resolve done. Invalid options throw before resources are allocated. */
export type Outcome<T>
  = { readonly status: 'finished', readonly value: T, readonly range: AudioRange }
    | { readonly status: 'cancelled', readonly reason: string }
    | { readonly status: 'failed', readonly error: Error }

/** One continuous interval. Finish seals input synchronously and does not await transcription. */
export interface Capture {
  readonly stream: ReadableStream<PcmBlock>
  /** Resolves at the first block. The owner shows permission as pending until then. */
  readonly started: Promise<void>
  readonly done: Promise<Outcome<void>>
  finish: () => Promise<Outcome<void>>
  /** Cancellation is immediate and errors the stream. */
  cancel: (reason: string) => void
}

export interface WindowOptions {
  readonly windowMs: number
  readonly hopMs: number
  readonly minWindowMs?: number
  /** @default latest. Latest replaces pending windows. Ordered preserves their order. */
  readonly scheduling?: 'latest' | 'ordered'
  readonly signal?: AbortSignal
  /** Keeps input history before windows that are still in inference. */
  readonly preRollMs?: number
}

/** The input attaches the range after inference. Results cannot publish after cancellation. */
export interface Observation<T> {
  readonly range: AudioRange
  readonly value: T
  readonly discontinuity: boolean
}

export interface Observer {
  readonly done: Promise<{ status: 'cancelled' } | { status: 'failed', error: Error }>
  cancel: () => void
}

/** A detector receives copied samples. Abort is cooperative. The runtime also rejects late results. */
export type Detector<T> = (window: AudioWindow, signal: AbortSignal) => Promise<T>

/**
 * Shares one source. The first subscriber opens it and the last one to leave closes it.
 * Each subscription ends with its own signal, so no consumer releases a lease.
 */
export declare class AudioInput {
  constructor(source: AudioInputSource, options?: {
    /** @default 0. The caller selects pre-roll history retention. */
    historyMs?: number
  })

  /** Undefined until the current connection delivers a block. */
  readonly position: Position | undefined
  readonly sampleRate: number | undefined
  /** With `from`, the stream first replays retained history. Missing history errors the stream. */
  subscribe(options?: { from?: Position, signal?: AbortSignal }): ReadableStream<PcmBlock>
  /** Keeps history from the returned frame while `signal` is active. */
  retain(frame: () => number | undefined, signal: AbortSignal): void
  /** Ends every subscription. A later subscription opens the source again. */
  close(): Promise<void>
}

/** A capture fails on a sample gap, because consumers treat it as continuous audio. */
export declare function capture(input: AudioInput, options?: { from?: Position, signal?: AbortSignal }): Capture

/** The result callback runs synchronously and must not retain PCM or perform blocking work. */
export declare function observe<T>(input: AudioInput, options: WindowOptions, detector: Detector<T>, onResult: (result: Observation<T>) => void): Observer

/** An immutable identity allocated by the conversation runtime. It is never reused. */
export interface TurnRef {
  readonly sessionId: string
  readonly turnId: string
}

/** Rendered audio of one clip. It does not prove perception or an exact spoken word boundary. */
export interface PlayedAudio {
  readonly throughMs: number
  /** Driver clock milliseconds of the first and last rendered sample. Undefined when no audio was rendered. */
  readonly interval?: { readonly startMs: number, readonly endMs: number }
}

export interface PlaybackReceipt {
  readonly groupId: string
  readonly status: 'silent' | 'failed'
  readonly played: readonly ({ readonly clipId: string } & PlayedAudio)[]
  readonly error?: Error
}

/** One response owns one group. A stopped or finished group never reopens. */
export interface PlaybackGroup {
  readonly id: string
  /** `startAtMs` is the earliest start on the driver clock. Clips in one group still start in order. */
  enqueue: (clip: { id: string, audio: Blob | ReadableStream<PcmBlock>, startAtMs?: number }) => Promise<'ended' | 'stopped' | 'failed'>
  /** Seals enqueue and drains accepted clips. */
  finish: () => Promise<PlaybackReceipt>
  /** Seals enqueue synchronously, drops queued clips, and fades active clips on the audio clock. */
  stop: (options: { fadeMs: number }) => Promise<PlaybackReceipt>
}

export interface AudioPlayback {
  /** The driver's audio clock in milliseconds. Browser playback uses `AudioContext.currentTime`. */
  nowMs: () => number
  /** The returned handle has a fresh internal generation, even when labels match. */
  openGroup: (label: string) => PlaybackGroup
}

/** The application coordinator owns reasoning, tool delivery, TTS, playback groups, and interruption records. */
export interface VoiceController {
  /** The pending or capturing attempt. Sealing clears it before final ASR and submission. */
  readonly activeInput: SpeechInputAttempt | undefined
  /** Returns immediately, including during microphone permission or a playback fade. */
  beginInput: (options: {
    sessionId: string
    interruptTurns: readonly TurnRef[]
    start: { kind: 'after-silence' } | { kind: 'speech-onset', at: Position, preRollMs?: number }
  }) => SpeechInputAttempt

  /** Registers a fresh turn and its output group. Closed turn IDs cannot reopen. */
  openResponse: (turn: TurnRef) => ResponseHandle

  /** Rejects new results for target turns immediately. Unrelated turns and microphone observation remain active. */
  interrupt: (options: { turns: readonly TurnRef[], cause: string }) => Interruption
}

/** The coordinator owns all startup races. End before recording starts cancels the attempt. */
export interface SpeechInputAttempt {
  readonly id: string
  readonly sessionId: string
  readonly state: SpeechInputAttemptState
  readonly done: Promise<SpeechInputAttemptOutcome>
  /** Calls the subscriber immediately. The returned function only removes that subscriber. */
  subscribe: (listener: (state: SpeechInputAttemptState) => void) => () => void
  end: () => Promise<SpeechInputAttemptOutcome>
  cancel: (reason: string) => void
  /** Reports ordered VAD coverage, including silence. Returns false for unrelated or sealed ranges. */
  noteActivity: (evidence: { range: AudioRange, speech: boolean }) => boolean
  /** Owns accepted audio windows and revision checks. Cancelling this observer also rejects its pending end decisions. */
  detectEnd: (options: {
    windowMs: number
    hopMs: number
    /** Ordered requires VAD coverage. Self-contained delegates activity judgment to this detector. */
    activity: 'ordered' | 'self-contained'
  }, detector: (evidence: TurnEvidence, signal: AbortSignal) => Promise<'continue' | 'end'>) => Observer
}

export type SpeechInputAttemptOutcome
  = { readonly status: 'committed', readonly messageId: string }
    | { readonly status: 'drafted', readonly draftId: string }
    | { readonly status: 'cancelled', readonly reason: string }
    | { readonly status: 'failed', readonly stage: 'source' | 'admission' | 'capture' | 'transcription' | 'detector' | 'submission', readonly error: Error }

export type SpeechInputAttemptState
  = { readonly phase: 'pending', readonly waitingFor: 'source' | 'silence' }
    | { readonly phase: 'capturing', readonly from: Position }
    | { readonly phase: 'finalizing' }
    | { readonly phase: 'settled', readonly outcome: SpeechInputAttemptOutcome }

/** The chat runtime passes signal to reasoning and synthesis. Delivery still checks this immutable turn identity. */
export interface ResponseHandle {
  readonly turn: TurnRef
  readonly signal: AbortSignal
  readonly playback: PlaybackGroup
  /** Marks generation complete, seals playback, and waits for accepted output to drain. */
  finish: () => Promise<'finished' | 'cancelled' | 'interrupted' | 'failed'>
}

export interface TurnEvidence {
  readonly audio: AudioWindow
  readonly transcript: { readonly revision: number, readonly text: string }
  readonly context: { readonly revision: number, readonly messages: readonly { role: string, text: string }[] }
  readonly speechRevision: number
}

/** Silence and durable notification have separate completion boundaries. */
export interface Interruption {
  readonly id: string
  readonly silenced: Promise<readonly {
    readonly turn: TurnRef
    readonly status: 'silent' | 'failed'
    readonly playback?: PlaybackReceipt
    readonly error?: Error
  }[]>
  readonly done: Promise<{
    readonly status: 'recorded' | 'failed'
    readonly notifications: readonly {
      readonly turn: TurnRef
      readonly eventId: string
      readonly status: 'acknowledged' | 'queued' | 'failed'
    }[]
    readonly error?: Error
  }>
}
