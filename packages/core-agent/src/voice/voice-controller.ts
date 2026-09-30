import type { AudioInput, AudioRange, FileOptions, Outcome, PcmBlock, PlaybackReceipt, Position } from '@proj-airi/pipelines-audio'

import type { SpeechOutput } from './response'
import type { TranscriptionEvent, TranscriptPatch, TranscriptSnapshot } from './transcript'
import type { SpeakerEvidence, SpeechSnapshot, TranscriptEdit, VoicePlugin, VoicePluginHandle, WriteResult } from './voice-plugin-types'
import type { VoicePluginSettings } from './voice-plugins'

import { Response } from './response'
import { SpeechInputAttempt } from './speech-input-attempt'
import { VoicePlugins } from './voice-plugins'

/** A provider request consumes media and produces transcription concurrently. */
export interface StreamingTranscriber {
  readonly capabilities: {
    readonly inputs: readonly ('pcm' | 'file' | 'native')[]
    readonly output: 'updates' | 'final'
  }
  transcribe: (request: {
    audio: { kind: 'pcm', stream: ReadableStream<PcmBlock> } | { kind: 'file', blob: Blob } | { kind: 'native', stream: MediaStream, ended: Promise<Outcome<void>> }
    signal: AbortSignal
  }) => ReadableStream<TranscriptionEvent>
}

/** Identity belongs to the conversation runtime and cannot be reused for a closed response. */
export interface TurnRef {
  readonly sessionId: string
  readonly turnId: string
}

/** Playback silence and durable agent notification have separate completion boundaries. */
export interface Interruption {
  readonly id: string
  readonly silenced: Promise<readonly { readonly turn: TurnRef, readonly status: 'silent' | 'failed', readonly playback?: PlaybackReceipt, readonly error?: Error }[]>
  readonly done: Promise<{ readonly status: 'recorded' | 'failed', readonly notifications: readonly { readonly turn: TurnRef, readonly eventId: string, readonly status: 'acknowledged' | 'queued' | 'failed' }[], readonly error?: Error }>
}

interface TurnInterruption {
  readonly eventId: string
  readonly turn: TurnRef
  readonly cause: string
  readonly silence: Promise<PlaybackReceipt>
  notification?: Promise<Awaited<Interruption['done']>['notifications'][number]>
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
  readonly audio?: AudioInput | (() => Promise<AudioInput>)
  /** @default owned. Borrowed input remains available to other controllers after this controller closes. */
  readonly audioOwnership?: 'owned' | 'borrowed'
  readonly transcriber?: (sessionId: string) => StreamingTranscriber
  /** @default WAV, 16 kHz, mono. Used only when the provider requires a completed file. */
  readonly file?: FileOptions
  readonly submit?: (submission: SpeechSubmission, signal: AbortSignal) => Promise<{ status: 'committed', messageId: string } | { status: 'drafted', draftId: string }>
  readonly speech?: (turn: TurnRef) => SpeechOutput
  /** Persistence retries must reuse eventId. This is an agent control event, not a chat message. */
  readonly recordInterruption?: (event: VoiceInterruptionEvent) => Promise<{ status: 'acknowledged' | 'queued' | 'failed' }>
  /** @default 100. Playback uses its audio clock to apply this fade. */
  readonly fadeMs?: number
  readonly conversationContext?: (sessionId: string) => { readonly revision: number, readonly messages: readonly { role: string, text: string }[] }
}

/** Coordinates input admission and downstream completion without owning browser or provider APIs. */
export class VoiceController {
  readonly plugins = new VoicePlugins(this)
  private readonly inputListeners = new Set<(attempt: SpeechInputAttempt) => void>()
  private current: SpeechInputAttempt | undefined
  private readonly attempts = new Map<string, SpeechInputAttempt>()
  private audioValue: AudioInput | undefined
  private audioSource: VoiceControllerOptions['audio'] | undefined
  private audioPromise: Promise<AudioInput> | undefined
  private readonly releasingAudio = new Set<Promise<void>>()
  private closing: Promise<void> | undefined
  private readonly responses = new Map<string, Response>()
  private readonly interruptions = new Map<string, TurnInterruption>()

  constructor(readonly options: VoiceControllerOptions) {
    this.audioSource = options.audio
    if (typeof options.audio !== 'function')
      this.audioValue = options.audio
  }

  get availableAudio(): AudioInput | undefined {
    return this.audioValue
  }

  /** Diagnostics cannot take ownership of a domain operation's completion. */
  reportError(stage: string, cause: unknown) {
    const error = cause instanceof Error ? cause : new Error('Voice operation failed', { cause })
    try {
      if (this.options.onError)
        this.options.onError({ stage, error })
      else
        console.error(`[VoiceController] ${stage}`, error)
    }
    catch (diagnosticError) {
      console.error('[VoiceController] Diagnostic handler failed', diagnosticError)
    }
  }

  get activeInput(): SpeechInputAttempt | undefined {
    return this.current
  }

  use(plugin: VoicePlugin, settings?: VoicePluginSettings): VoicePluginHandle {
    if (this.closing)
      throw new Error('Voice controller is closed')
    return this.plugins.use(plugin, settings)
  }

  /** Observers see pending input immediately, including attempts opened by signal plugins. */
  onInput(listener: (attempt: SpeechInputAttempt) => void): () => void {
    if (this.closing)
      throw new Error('Voice controller is closed')
    this.inputListeners.add(listener)
    return () => this.inputListeners.delete(listener)
  }

  beginInput(options: BeginSpeechInput): SpeechInputAttempt {
    if (this.closing)
      throw new Error('Voice controller is closed')
    this.current?.cancel('Replaced by a new input')
    const attempt = new SpeechInputAttempt(this, options)
    this.current = attempt
    this.attempts.set(attempt.id, attempt)
    for (const listener of this.inputListeners) {
      try {
        listener(attempt)
      }
      catch (error) {
        this.reportError('input-observer', error)
      }
    }
    void attempt.done.then(() => this.attempts.delete(attempt.id))
    void attempt.start()
    return attempt
  }

  cancelInput(inputId: string, reason: string): 'cancelled' | 'closed' {
    const attempt = this.attempts.get(inputId)
    if (!attempt)
      return 'closed'
    attempt.cancel(reason)
    return 'cancelled'
  }

  updateSpeakerEvidence(inputId: string, evidence: { range: AudioRange, value: Omit<SpeakerEvidence, 'revision'> }): WriteResult {
    const attempt = this.attempts.get(inputId)
    if (!attempt?.input || attempt.input.closed)
      return { status: 'rejected', reason: 'closed' }
    if (!attempt.acceptsEvidence(evidence.range))
      return { status: 'rejected', reason: 'stale' }
    return attempt.input.updateSpeakers(evidence.value)
  }

  correctInput(inputId: string, edits: readonly TranscriptEdit[]): WriteResult {
    const input = this.attempts.get(inputId)?.input
    if (!input || input.closed)
      return { status: 'rejected', reason: 'closed' }
    return input.patch('user', { edits, evidenceIds: [] }, () => true, true)
  }

  openResponse(turn: TurnRef): Response {
    if (this.closing)
      throw new Error('Voice controller is closed')
    const key = JSON.stringify([turn.sessionId, turn.turnId])
    const existing = this.responses.get(key)
    if (existing?.closed)
      throw new Error('Response turn identity is already used')
    if (existing)
      return existing
    if (!this.options.speech)
      throw new Error('Speech output is not configured')
    const response = new Response(turn, this.options.speech(turn))
    this.responses.set(key, response)
    return response
  }

  interrupt(options: { turns: readonly TurnRef[], cause: string }): Interruption {
    const id = crypto.randomUUID()
    const targets = [...new Map(options.turns.map(turn => [JSON.stringify([turn.sessionId, turn.turnId]), Object.freeze({ ...turn })])).entries()]
    const pending = targets.map(([key, turn]) => {
      const response = this.responses.get(key)
      let record = this.interruptions.get(key)
      if (!record && response && !response.closed) {
        record = { eventId: crypto.randomUUID(), turn, cause: options.cause, silence: response.interrupt(options.cause, this.options.fadeMs ?? 100) }
        this.interruptions.set(key, record)
      }
      const silence = record?.silence ?? response?.interrupt(options.cause, this.options.fadeMs ?? 100)
      const result = silence
        ? silence.then(playback => ({ turn, status: playback.status, playback, ...(playback.error ? { error: playback.error } : {}) }))
        : Promise.resolve({ turn, status: 'failed' as const, playback: undefined, error: new Error('Unknown response turn') })
      return { record, result, known: !!response }
    })
    const silenced = Promise.all(pending.map(target => target.result))
    const done = Promise.all(pending.flatMap(target => target.record ? [this.notifyInterruption(target.record)] : [])).then(notifications => ({ status: pending.some(target => !target.known) || notifications.some(item => item.status === 'failed') ? 'failed' as const : 'recorded' as const, notifications }))
    return { id, silenced, done }
  }

  /** Triggering workflow: {@link interrupt} → per-turn record → recordInterruption persistence acknowledgment. */
  private notifyInterruption(record: TurnInterruption): NonNullable<TurnInterruption['notification']> {
    if (record.notification)
      return record.notification
    const pending = (async () => {
      const playback = await record.silence
      try {
        if (!this.options.recordInterruption)
          return { turn: record.turn, eventId: record.eventId, status: 'failed' as const }
        const receipt = await this.options.recordInterruption({ eventId: record.eventId, turn: record.turn, cause: record.cause, playback })
        return { turn: record.turn, eventId: record.eventId, status: receipt.status }
      }
      catch (cause) {
        this.reportError('interruption', cause)
        return { turn: record.turn, eventId: record.eventId, status: 'failed' as const }
      }
    })()
    record.notification = pending
    void pending.then((result) => {
      if (result.status === 'failed' && record.notification === pending)
        record.notification = undefined
    })
    return pending
  }

  /** Pending permission is shared. An obsolete attempt never owns or closes the shared source. */
  acquireAudio(): Promise<AudioInput> {
    if (this.closing)
      return Promise.reject(new Error('Voice controller is closed'))
    if (!this.audioPromise) {
      const source = this.audioSource
      if (!source)
        return Promise.reject(new Error('Audio input is not connected'))
      let started: Promise<AudioInput>
      try {
        started = Promise.resolve(typeof source === 'function' ? source() : source)
      }
      catch (error) {
        return Promise.reject(error)
      }
      const pending = started.then((audio) => {
        if (this.audioPromise === pending)
          this.audioValue = audio
        return audio
      })
      this.audioPromise = pending
      void pending.catch(() => {
        if (this.audioPromise === pending)
          this.audioPromise = undefined
      })
    }
    return this.audioPromise
  }

  /** Replaces input ownership synchronously. Completion waits for old resources, including late permission results. Responses continue. */
  replaceAudio(source?: VoiceControllerOptions['audio']): Promise<void> {
    if (this.closing)
      throw new Error('Voice controller is closed')
    if (source === this.audioSource)
      return Promise.resolve()
    for (const attempt of this.attempts.values())
      attempt.cancel('Audio input replaced')
    const previous = this.audioPromise ?? Promise.resolve(this.audioValue)
    this.audioSource = source
    this.audioValue = typeof source === 'function' ? undefined : source
    this.audioPromise = undefined
    this.plugins.replaceAudio()
    const releasing = previous.then(audio => this.options.audioOwnership === 'borrowed' ? undefined : audio?.close(), (error) => {
      this.reportError('audio-startup', error)
    })
    this.releasingAudio.add(releasing)
    void releasing.finally(() => this.releasingAudio.delete(releasing)).catch(error => this.reportError('audio-release', error))
    return releasing
  }

  sealInput(attempt: SpeechInputAttempt) {
    if (this.current === attempt)
      this.current = undefined
  }

  close(): Promise<void> {
    if (this.closing)
      return this.closing
    for (const attempt of this.attempts.values())
      attempt.cancel('Voice controller closed')
    this.inputListeners.clear()
    for (const response of this.responses.values())
      response.cancel('Voice controller closed')
    const sourceClosed = this.options.audioOwnership === 'borrowed'
      ? undefined
      : this.audioPromise ? this.audioPromise.then(audio => audio.close()) : this.audioValue?.close()
    this.closing = Promise.all([this.plugins.close(), sourceClosed, ...this.releasingAudio, ...[...this.responses.values()].map(response => response.finish())]).then(() => {})
    return this.closing
  }
}
