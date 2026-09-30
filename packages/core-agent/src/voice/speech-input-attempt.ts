import type { AudioInput, AudioRange, AudioWindow, Capture, Observer, Position } from '@proj-airi/pipelines-audio'

import type { TranscriptionEvent } from './transcript'
import type { BeginSpeechInput, StreamingTranscriber, VoiceController } from './voice-controller'
import type { InputPlugins } from './voice-plugins'

import { SpeechInput } from './speech-input'

/** Stage identifies the external operation that failed. Cancellation is not a provider failure. */
export type SpeechInputAttemptOutcome
  = { readonly status: 'committed', readonly messageId: string }
    | { readonly status: 'drafted', readonly draftId: string }
    | { readonly status: 'cancelled', readonly reason: string }
    | { readonly status: 'failed', readonly stage: 'source' | 'admission' | 'capture' | 'transcription' | 'detector' | 'submission', readonly error: Error }

/** Pending state exists before permission resolves. Finalization frees admission for the next attempt. */
export type SpeechInputAttemptState
  = { readonly phase: 'pending', readonly waitingFor: 'source' | 'silence' }
    | { readonly phase: 'capturing', readonly from: Position }
    | { readonly phase: 'finalizing' }
    | { readonly phase: 'settled', readonly outcome: SpeechInputAttemptOutcome }

/** End detection binds audio evidence to the transcript and activity revisions read by its model. */
export interface TurnEvidence {
  readonly audio: AudioWindow
  readonly transcript: { readonly revision: number, readonly text: string }
  readonly context: { readonly revision: number, readonly messages: readonly { role: string, text: string }[] }
  readonly speechRevision: number
}

/** Owns one admission, capture, provider request, and submission. Normal end never aborts the provider. */
export class SpeechInputAttempt {
  readonly id = crypto.randomUUID()
  readonly sessionId: string
  readonly done: Promise<SpeechInputAttemptOutcome>
  private readonly completion = Promise.withResolvers<SpeechInputAttemptOutcome>()
  private readonly abort = new AbortController()
  private readonly listeners = new Set<(state: SpeechInputAttemptState) => void>()
  private capture: Capture<unknown> | undefined
  private reader: ReadableStreamDefaultReader<TranscriptionEvent> | undefined
  private current: SpeechInputAttemptState = { phase: 'pending', waitingFor: 'source' }
  private accepted: SpeechInput | undefined
  private plugins: InputPlugins | undefined
  private audio: AudioInput | undefined
  private activityEnd = 0
  private speechRevision = 0
  private from: Position | undefined
  private sealedFrame: number | undefined
  private detector: (Observer & { start: () => void }) | undefined
  private endProposal: (() => void) | undefined
  private stage: 'source' | 'admission' | 'capture' | 'transcription' | 'submission' = 'source'

  constructor(private readonly controller: VoiceController, private readonly options: BeginSpeechInput) {
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
      this.controller.sealInput(this)
      this.sealedFrame = this.audio?.position.frame
      this.change({ phase: 'finalizing' })
      this.detector?.cancel()
      void this.capture?.finish()
    }
    return this.done
  }

  cancel(reason: string) {
    this.settle({ status: 'cancelled', reason })
  }

  noteActivity(evidence: { range: AudioRange, speech: boolean }): boolean {
    const range = evidence.range
    if ((this.current.phase !== 'capturing' && (this.current.phase !== 'pending' || this.options.start.kind !== 'speech-onset')) || !this.acceptsEvidence(range) || !Number.isSafeInteger(range.startFrame) || !Number.isSafeInteger(range.endFrame) || range.endFrame <= this.activityEnd)
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
    return !!this.from && range.sourceId === this.from.sourceId && range.startFrame >= this.from.frame && range.endFrame > range.startFrame && range.endFrame <= (this.sealedFrame ?? this.audio?.position.frame ?? 0)
  }

  detectEnd(options: { windowMs: number, hopMs: number, activity: 'ordered' | 'self-contained' }, detector: (evidence: TurnEvidence, signal: AbortSignal) => Promise<'continue' | 'end'>): Observer {
    if (!Number.isFinite(options.windowMs) || options.windowMs <= 0 || !Number.isFinite(options.hopMs) || options.hopMs <= 0)
      throw new Error('Audio window and hop must be finite and positive')
    this.detector?.cancel()
    const completion = Promise.withResolvers<Awaited<Observer['done']>>()
    let observer: Observer | undefined
    let closed = false
    const owner = {
      done: completion.promise,
      cancel: () => {
        if (closed)
          return
        closed = true
        observer?.cancel()
        if (this.detector === owner) {
          this.detector = undefined
          this.endProposal = undefined
        }
        completion.resolve({ status: 'cancelled' })
      },
      start: () => {
        if (closed || observer || !this.audio || !this.accepted || this.current.phase !== 'capturing')
          return
        observer = this.audio.observe(options, async (window, signal) => {
          const transcript = this.accepted!.transcript.raw
          const speechRevision = this.speechRevision
          const context = this.controller.options.conversationContext?.(this.sessionId) ?? { revision: 0, messages: [] }
          const result = await detector({ audio: window, transcript, speechRevision, context }, signal)
          return { result, transcript, speechRevision, context }
        }, (observation) => {
          if (closed || observation.value.result !== 'end')
            return
          const { transcript, speechRevision, context } = observation.value
          const apply = () => {
            if (closed || this.current.phase !== 'capturing')
              return
            if (transcript.revision !== this.accepted!.transcript.raw.revision || speechRevision !== this.speechRevision || context.revision !== (this.controller.options.conversationContext?.(this.sessionId).revision ?? 0)) {
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
          owner.cancel()
          if (outcome.status === 'failed')
            this.settle({ status: 'failed', stage: 'detector', error: outcome.error })
        })
      },
    }
    this.detector = owner
    if (this.current.phase === 'finalizing' || this.current.phase === 'settled')
      owner.cancel()
    else
      owner.start()
    return owner
  }

  /** Triggering workflow: VoiceController.beginInput → admission → capture and provider output → submit. */
  async start() {
    try {
      const source = this.controller.acquireAudio().then(audio => ({ audio, error: undefined }), error => ({ audio: undefined, error }))
      let reserved = this.options.start.kind === 'speech-onset' && this.controller.availableAudio
        ? this.prepareCapture(this.controller.availableAudio)
        : undefined
      const interruption = this.options.interruptTurns.length
        ? this.controller.interrupt({ turns: this.options.interruptTurns, cause: 'speech-input' })
        : undefined
      if (interruption) {
        this.stage = 'admission'
        this.change({ phase: 'pending', waitingFor: 'silence' })
        if (this.options.start.kind === 'speech-onset' && !reserved) {
          const result = await source
          if (!result.audio)
            throw result.error
          if (this.abort.signal.aborted)
            return
          reserved = this.prepareCapture(result.audio)
          this.stage = 'admission'
        }
        const receipts = await interruption.silenced
        const failed = receipts.find(receipt => receipt.status === 'failed')
        if (failed)
          throw failed.error ?? new Error('Playback silence was not confirmed')
      }
      if (this.abort.signal.aborted)
        return
      this.stage = 'source'
      const result = await source
      if (!result.audio)
        throw result.error
      const audio = result.audio
      if (this.abort.signal.aborted)
        return
      const { provider, openMedia, file, from } = reserved ?? this.prepareCapture(audio)
      let media = openMedia()
      this.accepted = new SpeechInput(this.id, this.sessionId)
      this.plugins = this.controller.plugins.input(this.accepted)
      this.change({ phase: 'capturing', from })
      this.detector?.start()
      this.stage = 'transcription'
      if (file) {
        const result = await file.done
        if (result.status !== 'finished' || this.abort.signal.aborted)
          return
        media = { kind: 'file', blob: result.value }
      }
      this.reader = provider.transcribe({ audio: media!, signal: this.abort.signal }).getReader()
      while (!this.abort.signal.aborted) {
        const result = await this.reader.read()
        if (this.abort.signal.aborted)
          return
        if (result.done)
          break
        if (result.value.type === 'complete' && this.current.phase !== 'finalizing')
          throw new Error('Provider completed before capture ended')
        this.accepted.accept(result.value)
        this.change(this.current)
      }
      this.accepted.finishTranscription()
      const captured = await this.capture!.done
      if (captured.status !== 'finished' || this.abort.signal.aborted)
        return
      this.stage = 'submission'
      await this.plugins.finish()
      if (this.abort.signal.aborted)
        return
      const transcript = this.accepted.transcript
      const submission = Object.freeze({
        submissionId: this.id,
        sessionId: this.sessionId,
        text: transcript.corrected.text,
        transcript: Object.freeze({ raw: transcript.raw, corrected: transcript.corrected, history: transcript.history, patches: transcript.patchHistory }),
        context: this.accepted.context,
        ...(this.accepted.speakers ? { speakers: this.accepted.speakers } : {}),
      })
      this.accepted.seal()
      if (!this.controller.options.submit)
        throw new Error('Speech submission is not configured')
      const outcome = await this.controller.options.submit(submission, this.abort.signal)
      if (!this.abort.signal.aborted)
        this.settle(outcome)
    }
    catch (cause) {
      this.settle({ status: 'failed', stage: this.stage, error: cause instanceof Error ? cause : new Error('Speech input failed', { cause }) })
    }
    finally {
      this.reader?.releaseLock()
    }
  }

  private prepareCapture(audio: AudioInput) {
    this.stage = 'capture'
    this.audio = audio
    let from = this.options.start.kind === 'speech-onset' ? this.options.start.at : audio.position
    if (this.options.start.kind === 'speech-onset' && this.options.start.preRollMs) {
      if (!audio.sampleRate)
        throw new Error('Source sample rate is unavailable for pre-roll')
      from = { ...from, frame: Math.max(0, from.frame - Math.floor(this.options.start.preRollMs * audio.sampleRate / 1000)) }
    }
    const provider = this.controller.options.transcriber?.(this.sessionId)
    if (!provider)
      throw new Error('Speech transcription is not configured')
    this.from = from
    this.activityEnd = this.options.start.kind === 'speech-onset' ? this.options.start.at.frame : from.frame
    let openMedia: () => Parameters<StreamingTranscriber['transcribe']>[0]['audio'] | undefined = () => undefined
    let file: Capture<Blob> | undefined
    if (provider.capabilities.inputs.includes('pcm')) {
      const capture = audio.capture({ delivery: 'pcm', from, signal: this.abort.signal })
      this.capture = capture
      openMedia = () => ({ kind: 'pcm', stream: capture.media })
    }
    else if (provider.capabilities.inputs.includes('native') && audio.capabilities.nativeStream) {
      const capture = audio.capture({ delivery: 'media-stream', from, signal: this.abort.signal })
      this.capture = capture
      openMedia = () => ({ kind: 'native', stream: capture.media, ended: capture.done })
    }
    else if (provider.capabilities.inputs.includes('file')) {
      file = audio.capture({ delivery: 'file', file: this.controller.options.file ?? { mimeType: 'audio/wav', sampleRate: 16000, channels: 1 }, from, signal: this.abort.signal })
      this.capture = file
    }
    else {
      throw new Error('Provider and source have no supported media format')
    }
    void this.capture.done.then((outcome) => {
      if (outcome.status === 'failed')
        this.settle({ status: 'failed', stage: 'capture', error: outcome.error })
      if (outcome.status === 'cancelled')
        this.cancel(outcome.reason)
      if (outcome.status === 'finished' && this.current.phase === 'capturing')
        void this.end()
    })
    return { provider, openMedia, file, from }
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
      this.controller.reportError('subscriber', error)
    }
  }

  private settle(outcome: SpeechInputAttemptOutcome) {
    if (this.current.phase === 'settled')
      return
    this.controller.sealInput(this)
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
