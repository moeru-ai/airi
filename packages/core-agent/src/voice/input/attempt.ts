import type { AudioInput, AudioRange, Capture, Position } from '@proj-airi/pipelines-audio'

import type { Interruption } from '../interruption'
import type { TurnRef } from '../turn'
import type { SpeechInputPorts, StreamingTranscriber } from './ports'
import type { TranscriptionEvent } from './transcript'
import type { BeginSpeechInput, SpeechContextEntry, SpeechInputAttemptOutcome, SpeechInputAttemptState, SpeechSubmission } from './types'

import { capture } from '@proj-airi/pipelines-audio'
import { nanoid } from 'nanoid/non-secure'

import { errorFromCause } from '../../utils/error'
import { SpeechInput } from './speech-input'

/** Plugin work on one input. `finish` runs finalization stages. `close` aborts all plugin work. */
interface InputPluginLifetime {
  readonly context: readonly SpeechContextEntry[]
  finish: () => Promise<void>
  close: (reason: string) => Promise<void>
}

/** The controller grants one attempt only the operations needed for its lifetime. */
export interface SpeechInputAttemptOwner {
  audio: () => AudioInput | undefined
  interrupt: (options: { turns: readonly TurnRef[], cause: string }) => Interruption
  createPlugins: (attempt: SpeechInputAttempt, input: SpeechInput) => InputPluginLifetime
  options: SpeechInputPorts
  seal: (attempt: SpeechInputAttempt) => void
  reportError: (stage: string, error: unknown) => void
}

/** Owns one admission, capture, provider request, and submission. Normal end never aborts the provider. */
export class SpeechInputAttempt {
  readonly id = nanoid()
  readonly sessionId: string
  readonly cause: string | undefined
  readonly done: Promise<SpeechInputAttemptOutcome>
  private readonly completion = Promise.withResolvers<SpeechInputAttemptOutcome>()
  private readonly abort = new AbortController()
  private readonly listeners = new Set<(state: SpeechInputAttemptState) => void>()
  private capture: Capture | undefined
  private reader: ReadableStreamDefaultReader<TranscriptionEvent> | undefined
  private current: SpeechInputAttemptState = { phase: 'pending', waitingFor: 'source' }
  private accepted: SpeechInput | undefined
  private plugins: InputPluginLifetime | undefined
  private audio: AudioInput | undefined
  // The first frame of the capture. A speech onset knows it at once, and a live capture learns it from its first block.
  private from: Position | undefined
  // The source position when a live capture was prepared. Its first block starts here.
  private liveStart = 0
  private sealedFrame: number | undefined
  private stage: 'source' | 'admission' | 'capture' | 'transcription' | 'submission' = 'source'
  private started = false

  constructor(private readonly owner: SpeechInputAttemptOwner, private readonly options: BeginSpeechInput) {
    this.sessionId = options.sessionId
    this.cause = options.cause
    this.done = this.completion.promise
  }

  get state(): SpeechInputAttemptState {
    return this.current
  }

  get input(): SpeechInput | undefined {
    return this.accepted
  }

  subscribe(listener: (state: SpeechInputAttemptState) => void): () => void {
    this.listeners.add(listener)
    this.notify(listener)
    return () => this.listeners.delete(listener)
  }

  end(): Promise<SpeechInputAttemptOutcome> {
    if (this.current.phase === 'pending')
      this.cancel('Input ended before capture started')

    if (this.current.phase === 'capturing') {
      this.owner.seal(this)
      this.sealedFrame = this.audio?.position?.frame
      this.change({ phase: 'finalizing' })
      void this.capture?.finish()
    }

    return this.done
  }

  cancel(reason: string) {
    this.settle({ status: 'cancelled', reason })
  }

  acceptsEvidence(range: AudioRange): boolean {
    if (!this.from || range.sourceId !== this.from.sourceId)
      return false

    const latestFrame = this.sealedFrame ?? this.audio?.position?.frame ?? 0
    return range.startFrame >= this.from.frame && range.endFrame > range.startFrame && range.endFrame <= latestFrame
  }

  /** Triggering workflow: VoiceController.beginInput → admission → capture and provider output → submit. */
  async start() {
    if (this.started)
      throw new Error('Speech input attempt already started')

    this.started = true

    try {
      const prepared = await this.admitCapture()
      if (!prepared)
        return

      const { provider, capture } = prepared
      this.accepted = new SpeechInput(this.id, this.sessionId)
      this.plugins = this.owner.createPlugins(this, this.accepted)
      this.change({ phase: 'capturing', from: this.from! })

      if (!await this.readTranscription(provider, capture))
        return

      await this.submitInput()
    }
    catch (cause) {
      this.settle({ status: 'failed', stage: this.stage, error: errorFromCause(cause, 'Speech input failed') })
    }
    finally {
      this.reader?.releaseLock()
    }
  }

  /**
   * Speech onset reserves its capture before playback silence, so retained pre-roll survives the fade.
   * A manual input starts capture after silence, so the assistant's last audio stays out of the transcript.
   * Admission ends when the source delivers audio, which also covers a pending microphone permission.
   */
  private async admitCapture() {
    const audio = this.owner.audio()
    if (!audio)
      throw new Error('Audio input is not connected')

    let reserved = this.options.start.kind === 'speech-onset' ? this.prepareCapture(audio) : undefined
    const interruption = this.options.interruptTurns.length
      ? this.owner.interrupt({ turns: this.options.interruptTurns, cause: 'speech-input' })
      : undefined

    if (interruption) {
      this.change({ phase: 'pending', waitingFor: 'silence' })
      this.stage = 'admission'
      const receipts = await interruption.silenced
      const failed = receipts.find(receipt => receipt.status === 'failed')
      if (failed)
        throw failed.error ?? new Error('Playback silence was not confirmed')
    }
    if (this.abort.signal.aborted)
      return

    reserved ??= this.prepareCapture(audio)
    this.stage = 'source'
    this.change({ phase: 'pending', waitingFor: 'source' })
    await Promise.race([reserved.capture.started, reserved.capture.done])
    if (this.abort.signal.aborted || this.current.phase === 'settled')
      return

    // A live capture starts at the first block it receives, so its start position is known only now.
    this.from ??= audio.position && { sourceId: audio.position.sourceId, frame: this.liveStart }
    return reserved
  }

  private async readTranscription(provider: StreamingTranscriber, capture: Capture): Promise<boolean> {
    this.stage = 'transcription'
    this.reader = provider.transcribe({ audio: capture.stream, signal: this.abort.signal }).getReader()
    while (!this.abort.signal.aborted) {
      const result = await this.reader.read()
      if (this.abort.signal.aborted)
        return false
      if (result.done)
        break
      if (result.value.type === 'complete' && this.current.phase !== 'finalizing')
        throw new Error('Provider completed before capture ended')

      this.accepted!.accept(result.value)
      this.change(this.current)
    }

    this.accepted!.finishTranscription()
    const captured = await capture.done
    return captured.status === 'finished' && !this.abort.signal.aborted
  }

  private async submitInput(): Promise<void> {
    this.stage = 'submission'
    await this.plugins!.finish()
    if (this.abort.signal.aborted)
      return

    const accepted = this.accepted!
    const transcript = accepted.transcript
    const { speakers } = accepted.document
    const submission: SpeechSubmission = Object.freeze({
      submissionId: this.id,
      sessionId: this.sessionId,
      text: transcript.corrected.text,
      transcript: Object.freeze({ raw: transcript.raw, corrected: transcript.corrected, history: transcript.history, patches: transcript.patchHistory }),
      context: Object.freeze(this.plugins!.context),
      ...(speakers ? { speakers } : {}),
    })
    accepted.seal()
    if (!this.owner.options.submit)
      throw new Error('Speech submission is not configured')
    const outcome = await this.owner.options.submit(submission, this.abort.signal)
    if (!this.abort.signal.aborted)
      this.settle(outcome)
  }

  private prepareCapture(audio: AudioInput) {
    this.stage = 'capture'
    this.audio = audio

    const provider = this.owner.options.transcriber?.(this.sessionId)
    if (!provider)
      throw new Error('Speech transcription is not configured')

    let from: Position | undefined
    if (this.options.start.kind === 'speech-onset') {
      const { at, preRollMs } = this.options.start
      if (preRollMs && !audio.sampleRate)
        throw new Error('Source sample rate is unavailable for pre-roll')

      from = preRollMs
        ? {
            ...at,
            frame: Math.max(0, at.frame - Math.floor(preRollMs * audio.sampleRate! / 1000)),
          }
        : at
    }
    else {
      // A live capture begins at the next block. That block starts at the current position when the source is open.
      this.liveStart = audio.position?.frame ?? 0
    }

    this.from = from ?? audio.position

    const recording = capture(audio, { from, signal: this.abort.signal })
    this.capture = recording
    void recording.done.then((outcome) => {
      if (outcome.status === 'failed')
        this.settle({ status: 'failed', stage: 'capture', error: outcome.error })
      if (outcome.status === 'cancelled')
        this.cancel(outcome.reason)
      if (outcome.status === 'finished' && this.current.phase === 'capturing')
        void this.end()
    })

    return { provider, capture: recording }
  }

  private change(state: SpeechInputAttemptState) {
    this.current = Object.freeze(state)
    for (const listener of this.listeners)
      this.notify(listener)
  }

  /** Triggering workflow: {@link change} or {@link subscribe} → state snapshot → UI listener and host diagnostics. */
  private notify(listener: (state: SpeechInputAttemptState) => void) {
    try {
      listener(this.current)
    }
    catch (error) {
      this.owner.reportError('subscriber', error)
    }
  }

  private settle(outcome: SpeechInputAttemptOutcome) {
    if (this.current.phase === 'settled')
      return

    this.owner.seal(this)
    this.change({ phase: 'settled', outcome })
    if (outcome.status === 'cancelled' || outcome.status === 'failed') {
      this.abort.abort(outcome)
      this.capture?.cancel('Speech input closed')
      void this.reader?.cancel(outcome).catch(() => {})
    }

    this.accepted?.seal()
    void this.plugins?.close(outcome.status === 'cancelled' ? outcome.reason : 'Speech input settled')
    this.completion.resolve(outcome)
  }
}
