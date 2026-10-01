import type { AudioInput, AudioRange, Capture, Observer, Position } from '@proj-airi/pipelines-audio'

import type { EndDetectionOptions, EndDetector, SpeechActivityEvidence, SpeechInputAttemptOutcome, SpeechInputAttemptState } from './speech-input-types'
import type { TranscriptionEvent } from './transcript'
import type { TurnRef } from './turn'
import type { BeginSpeechInput, Interruption, StreamingTranscriber, VoiceControllerOptions } from './voice-contracts'
import type { SpeechSubscription } from './voice-plugin-types'

import { capture, observe } from '@proj-airi/pipelines-audio'

import { errorFromCause } from '../utils/error'
import { SpeechInput } from './speech-input'

interface InputPluginLifetime {
  finish: () => Promise<void>
  close: (outcome: Awaited<SpeechSubscription['done']>) => Promise<void>
}

/** The controller grants one attempt only the operations needed for its lifetime. */
export interface SpeechInputAttemptOwner {
  audio: () => AudioInput | undefined
  interrupt: (options: { turns: readonly TurnRef[], cause: string }) => Interruption
  createPlugins: (input: SpeechInput) => InputPluginLifetime
  options: Pick<VoiceControllerOptions, 'transcriber' | 'submit' | 'conversationContext'>
  seal: (attempt: SpeechInputAttempt) => void
  reportError: (stage: string, error: unknown) => void
}

export type { SpeechInputAttemptOutcome, SpeechInputAttemptState, TurnEvidence } from './speech-input-types'

/** Owns one admission, capture, provider request, and submission. Normal end never aborts the provider. */
export class SpeechInputAttempt {
  readonly id = crypto.randomUUID()
  readonly sessionId: string
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
  private activityEnd = 0
  private speechRevision = 0
  private from: Position | undefined
  private sealedFrame: number | undefined
  private detector: (Observer & { start: () => void }) | undefined
  private endProposal: (() => void) | undefined
  private stage: 'source' | 'admission' | 'capture' | 'transcription' | 'submission' = 'source'
  private started = false

  constructor(private readonly owner: SpeechInputAttemptOwner, private readonly options: BeginSpeechInput) {
    this.sessionId = options.sessionId
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
      this.detector?.cancel()
      void this.capture?.finish()
    }

    return this.done
  }

  cancel(reason: string) {
    this.settle({ status: 'cancelled', reason })
  }

  noteActivity(evidence: SpeechActivityEvidence): boolean {
    const range = evidence.range
    // A reserved capture already owns audio from its start position, even before admission completes.
    const acceptsPending = this.current.phase === 'pending' && this.capture !== undefined
    if (this.current.phase !== 'capturing' && !acceptsPending)
      return false

    if (!this.acceptsEvidence(range) || !Number.isSafeInteger(range.startFrame) || !Number.isSafeInteger(range.endFrame))
      return false

    if (range.endFrame <= this.activityEnd)
      return false

    if (range.startFrame > this.activityEnd) {
      this.endProposal = undefined
      return false
    }

    this.activityEnd = range.endFrame
    if (evidence.speech)
      this.speechRevision += 1

    this.endProposal?.()
    return true
  }

  acceptsEvidence(range: AudioRange): boolean {
    if (!this.from || range.sourceId !== this.from.sourceId)
      return false
    const latestFrame = this.sealedFrame ?? this.audio?.position?.frame ?? 0
    return range.startFrame >= this.from.frame && range.endFrame > range.startFrame && range.endFrame <= latestFrame
  }

  detectEnd(options: EndDetectionOptions, detector: EndDetector): Observer {
    if (!Number.isFinite(options.windowMs) || options.windowMs <= 0 || !Number.isFinite(options.hopMs) || options.hopMs <= 0)
      throw new Error('Audio window and hop must be finite and positive')

    this.detector?.cancel()
    const completion = Promise.withResolvers<Awaited<Observer['done']>>()
    let observer: Observer | undefined
    let closed = false
    const observationHandle = {
      done: completion.promise,
      cancel: () => {
        if (closed)
          return

        closed = true
        observer?.cancel()
        if (this.detector === observationHandle) {
          this.detector = undefined
          this.endProposal = undefined
        }
        completion.resolve({ status: 'cancelled' })
      },
      start: () => {
        if (closed || observer || !this.audio || !this.accepted || this.current.phase !== 'capturing')
          return

        observer = observe(this.audio, options, async (window, signal) => {
          const transcript = this.accepted!.transcript.raw
          const speechRevision = this.speechRevision
          const context = this.owner.options.conversationContext?.(this.sessionId) ?? { revision: 0, messages: [] }
          const result = await detector({ audio: window, transcript, speechRevision, context }, signal)
          return { result, transcript, speechRevision, context }
        }, (observation) => {
          if (closed || observation.value.result !== 'end')
            return

          const { transcript, speechRevision, context } = observation.value
          const apply = () => {
            if (closed || this.current.phase !== 'capturing')
              return

            const currentContextRevision = this.owner.options.conversationContext?.(this.sessionId).revision ?? 0
            const evidenceChanged = transcript.revision !== this.accepted!.transcript.raw.revision
              || speechRevision !== this.speechRevision
              || context.revision !== currentContextRevision
            if (evidenceChanged) {
              this.endProposal = undefined
              return
            }

            if (options.activity === 'ordered' && observation.range.endFrame > this.activityEnd)
              return

            void this.end()
          }
          this.endProposal = apply
          apply()
        })
        void observer.done.then((outcome) => {
          if (closed)
            return

          completion.resolve(outcome)
          observationHandle.cancel()
          if (outcome.status === 'failed')
            this.settle({ status: 'failed', stage: 'detector', error: outcome.error })
        })
      },
    }
    this.detector = observationHandle
    if (this.current.phase === 'finalizing' || this.current.phase === 'settled')
      observationHandle.cancel()
    else
      observationHandle.start()

    return observationHandle
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
      this.plugins = this.owner.createPlugins(this.accepted)
      this.change({ phase: 'capturing', from: this.from! })
      this.detector?.start()

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
    this.from ??= audio.position && { sourceId: audio.position.sourceId, frame: this.activityEnd }
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
    const submission = Object.freeze({
      submissionId: this.id,
      sessionId: this.sessionId,
      text: transcript.corrected.text,
      transcript: Object.freeze({ raw: transcript.raw, corrected: transcript.corrected, history: transcript.history, patches: transcript.patchHistory }),
      context: accepted.context,
      ...(accepted.speakers ? { speakers: accepted.speakers } : {}),
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
      from = preRollMs ? { ...at, frame: Math.max(0, at.frame - Math.floor(preRollMs * audio.sampleRate! / 1000)) } : at
      this.activityEnd = at.frame
    }
    else {
      // A live capture begins at the next block. That block starts at the current position when the source is open.
      this.activityEnd = audio.position?.frame ?? 0
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
    this.detector?.cancel()
    if (outcome.status === 'cancelled' || outcome.status === 'failed') {
      this.abort.abort(outcome)
      this.capture?.cancel('Speech input closed')
      void this.reader?.cancel(outcome).catch(() => {})
    }
    this.accepted?.seal()
    void this.plugins?.close(outcome.status === 'failed' || outcome.status === 'cancelled' ? outcome : { status: 'finished' })
    this.completion.resolve(outcome)
  }
}
