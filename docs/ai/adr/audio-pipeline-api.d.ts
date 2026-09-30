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

/** This adapter transfers one readable source to AudioInput. Close releases only resources owned by the adapter. */
export interface AudioSource {
  readonly id: string
  readonly frames: ReadableStream<PcmBlock>
  close: () => Promise<void>
}

/** Browser capabilities are explicit. A native output factory is absent on unsupported runtimes. */
export interface MediaAdapters {
  supportsFile: (options: FileOptions) => boolean
  encode: (frames: ReadableStream<PcmBlock>, options: FileOptions, signal: AbortSignal) => Promise<Blob>
  nativeStream?: (frames: ReadableStream<PcmBlock>, signal: AbortSignal) => {
    readonly media: MediaStream
    /** Resolves after EOS drains through the derived output and its owned tracks end. */
    readonly done: Promise<void>
  }
}

export interface FileOptions {
  readonly mimeType: string
  readonly sampleRate: number
  readonly channels: 1 | 2
}

/** Operational failures resolve done. Invalid options throw before resources are allocated. */
export type Outcome<T>
  = { readonly status: 'finished', readonly value: T, readonly range: AudioRange }
    | { readonly status: 'cancelled', readonly reason: string }
    | { readonly status: 'failed', readonly error: Error }

/** Finish seals input synchronously. It does not await transcription or conversation processing. */
export interface Capture<T> {
  readonly done: Promise<Outcome<T>>
  finish: () => Promise<Outcome<T>>
  /** Cancellation is immediate. It also wins during finalization, before done settles. */
  cancel: (reason: string) => void
}

/** Stream cancellation cancels capture. Native tracks stay capture-owned and end through finish or cancel. */
export interface LiveCapture<T, R = void> extends Capture<R> {
  readonly media: T
}

export interface CaptureOptions {
  /** Omission starts at the current input position. Unavailable history produces a failed capture. */
  readonly from?: Position
  readonly signal?: AbortSignal
}

export interface WindowOptions {
  readonly windowMs: number
  readonly hopMs: number
  /** @default latest. Latest replaces pending windows. Ordered preserves their order. */
  readonly scheduling?: 'latest' | 'ordered'
  readonly signal?: AbortSignal
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

/** One source, bounded history, and independent capture and observation lifetimes. */
export declare class AudioInput {
  /** The application supplies browser and codec adapters at its composition root. */
  constructor(source: AudioSource, adapters: MediaAdapters, options?: {
    /** @default 0. The caller selects pre-roll history retention. */
    historyMs?: number
  })

  readonly position: Position
  readonly capabilities: { readonly nativeStream: boolean, readonly supportsFile: (options: FileOptions) => boolean }
  capture(options: CaptureOptions & { delivery: 'file', file: FileOptions }): Capture<Blob>
  capture(options: CaptureOptions & { delivery: 'pcm' }): LiveCapture<ReadableStream<PcmBlock>>
  capture(options: CaptureOptions & { delivery: 'media-stream' }): LiveCapture<MediaStream>
  /** Both outputs use one interval. File success does not assert downstream transcription success. */
  capture(options: CaptureOptions & { delivery: 'pcm-and-file', file: FileOptions }): LiveCapture<ReadableStream<PcmBlock>, Blob>

  /** The result callback runs synchronously and must not retain PCM or perform blocking work. */
  observe<T>(options: WindowOptions, detector: Detector<T>, onResult: (result: Observation<T>) => void): Observer
  /** Close cancels all children, releases owned source resources, and rejects results from cancelled detectors. */
  close(): Promise<void>
}

/** An immutable identity allocated by the conversation runtime. It is never reused. */
export interface TurnRef {
  readonly sessionId: string
  readonly turnId: string
}

/** Playback position estimates rendered audio. It does not prove perception or an exact spoken word boundary. */
export interface PlaybackReceipt {
  readonly groupId: string
  readonly status: 'silent' | 'failed'
  readonly played: readonly { clipId: string, throughMs: number }[]
  readonly error?: Error
}

/** One response owns one group. A stopped or finished group never reopens. */
export interface PlaybackGroup {
  readonly id: string
  enqueue: (clip: { id: string, audio: Blob | ReadableStream<PcmBlock> }) => Promise<'ended' | 'stopped' | 'failed'>
  /** Seals enqueue and drains accepted clips. */
  finish: () => Promise<PlaybackReceipt>
  /** Seals enqueue synchronously, drops queued clips, and fades active clips on the audio clock. */
  stop: (options: { fadeMs: number }) => Promise<PlaybackReceipt>
}

export interface AudioPlayback {
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
