import type { AudioInput, AudioRange, PlaybackReceipt } from '@proj-airi/pipelines-audio'

import type { SpeechInputAttemptOwner } from './speech-input-attempt'
import type { TurnRef } from './turn'
import type { BeginSpeechInput, Interruption, VoiceControllerOptions } from './voice-contracts'
import type { SpeakerEvidence, TranscriptEdit, VoicePlugin, VoicePluginHandle, WriteResult } from './voice-plugin-types'
import type { VoicePluginSettings } from './voice-plugins'

import { nanoid } from 'nanoid/non-secure'

import { errorFromCause } from '../utils/error'
import { VoiceResponse } from './response'
import { SpeechInputAttempt } from './speech-input-attempt'
import { turnKey } from './turn'
import { VoicePlugins } from './voice-plugins'

export type { TurnRef } from './turn'
export type { BeginSpeechInput, Interruption, SpeechSubmission, StreamingTranscriber, VoiceControllerOptions, VoiceInterruptionEvent } from './voice-contracts'

interface TurnInterruption {
  readonly eventId: string
  readonly turn: TurnRef
  readonly cause: string
  readonly silence: Promise<PlaybackReceipt>
  notification?: Promise<Awaited<Interruption['done']>['notifications'][number]>
}

/** Coordinates input admission and downstream completion without owning browser or provider APIs. */
export class VoiceController {
  private readonly plugins = new VoicePlugins({
    activeInput: () => this.current,
    audio: () => this.audioInput,
    beginInput: options => this.beginInput(options),
    cancelInput: (id, reason) => this.cancelInput(id, reason),
    interrupt: options => this.interrupt(options),
    reportError: (stage, cause) => this.reportError(stage, cause),
  })

  private readonly inputListeners = new Set<(attempt: SpeechInputAttempt) => void>()
  private current: SpeechInputAttempt | undefined
  private readonly attempts = new Map<string, SpeechInputAttempt>()
  private audioInput: AudioInput | undefined
  private closing: Promise<void> | undefined
  private readonly responses = new Map<string, VoiceResponse>()
  /**
   * Turn keys stay here after their response closes, so a late producer cannot reopen finished speech.
   * The set holds one short key per turn and clears when the controller closes.
   */
  private readonly usedTurns = new Set<string>()
  private readonly interruptions = new Map<string, TurnInterruption>()

  /** Every attempt receives the same narrow view of this controller. */
  private readonly inputOwner: SpeechInputAttemptOwner

  constructor(private readonly options: VoiceControllerOptions) {
    this.audioInput = options.audio
    this.inputOwner = {
      options,
      audio: () => this.audioInput,
      interrupt: request => this.interrupt(request),
      createPlugins: input => this.plugins.input(input),
      seal: attempt => this.sealInput(attempt),
      reportError: (stage, error) => this.reportError(stage, error),
    }
  }

  get audio(): AudioInput | undefined {
    return this.audioInput
  }

  /** Diagnostics cannot take ownership of a domain operation's completion. */
  private reportError(stage: string, cause: unknown) {
    const error = errorFromCause(cause, 'Voice operation failed')
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

    const attempt = new SpeechInputAttempt(this.inputOwner, options)
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

  openResponse(turn: TurnRef): VoiceResponse {
    if (this.closing)
      throw new Error('Voice controller is closed')
    const key = turnKey(turn)
    const existing = this.responses.get(key)
    if (existing)
      return existing
    if (this.usedTurns.has(key))
      throw new Error('Response turn identity is already used')
    if (!this.options.speech)
      throw new Error('Speech output is not configured')

    const response = new VoiceResponse(turn, this.options.speech(turn), () => this.responses.delete(key))
    this.usedTurns.add(key)
    this.responses.set(key, response)
    return response
  }

  interrupt(options: { turns: readonly TurnRef[], cause: string }): Interruption {
    const id = nanoid()
    const fadeMs = this.options.fadeMs ?? 100
    const unique = new Map(options.turns.map(turn => [turnKey(turn), Object.freeze({ ...turn })]))
    const targets = [...unique.entries()]

    const pending = targets.map(([key, turn]) => {
      const response = this.responses.get(key)
      let record = this.interruptions.get(key)
      if (!record && response && !response.closed) {
        record = { eventId: nanoid(), turn, cause: options.cause, silence: response.interrupt(options.cause, fadeMs) }
        this.interruptions.set(key, record)
      }

      const silence = record?.silence ?? response?.interrupt(options.cause, fadeMs)
      if (silence) {
        const result = silence.then(playback => ({ turn, status: playback.status, playback, ...(playback.error ? { error: playback.error } : {}) }))
        return { record, result, known: true }
      }

      // A finished response released its playback group. It is already silent, so there is nothing to record.
      if (this.usedTurns.has(key))
        return { record, result: Promise.resolve({ turn, status: 'silent' as const }), known: true }

      return { record, result: Promise.resolve({ turn, status: 'failed' as const, error: new Error('Unknown response turn') }), known: false }
    })

    const silenced = Promise.all(pending.map(target => target.result))
    const notifications = pending.flatMap(target => target.record ? [this.notifyInterruption(target.record)] : [])
    const done = Promise.all(notifications).then((results) => {
      const failed = pending.some(target => !target.known) || results.some(item => item.status === 'failed')
      return { status: failed ? 'failed' as const : 'recorded' as const, notifications: results }
    })

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
      else if (result.status !== 'failed' && record.notification === pending)
        this.interruptions.delete(turnKey(record.turn))
    })
    return pending
  }

  /**
   * Switches future inputs and plugin observations to another shared input, for example after a device change.
   * Active attempts cancel, because their frame coordinates belong to the old source. Responses continue.
   */
  replaceAudio(audio: AudioInput | undefined) {
    if (this.closing)
      throw new Error('Voice controller is closed')
    if (audio === this.audioInput)
      return

    for (const attempt of this.attempts.values())
      attempt.cancel('Audio input replaced')
    this.audioInput = audio
    this.plugins.replaceAudio()
  }

  private sealInput(attempt: SpeechInputAttempt) {
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

    // Attempts and plugins end their own input subscriptions. The shared input stays with its owner.
    const responsesClosed = [...this.responses.values()].map(response => response.finish())
    this.closing = Promise.all([this.plugins.close(), ...responsesClosed]).then(() => {}).finally(() => {
      this.responses.clear()
      this.interruptions.clear()
      this.usedTurns.clear()
    })
    return this.closing
  }
}
