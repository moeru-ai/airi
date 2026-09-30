import type { AudioPlayback, IntentHandle, PcmBlock, PlaybackGroup, PlaybackItem, PlaybackReceipt, SpeechPipelineEvents, SpeechPipelineOptions } from '@proj-airi/pipelines-audio'

import type { TurnRef } from './voice-controller'

import { createPushStream, createSpeechPipeline } from '@proj-airi/pipelines-audio'

/** Each synthesized part carries optional display text. Audio ownership transfers to playback. */
export interface SpeechAudio {
  readonly audio: Blob | ReadableStream<PcmBlock>
  readonly text?: string
}

/** Provider settings are selected once when a response opens. */
export type SpeechOutput = {
  readonly playback: AudioPlayback
  readonly onSpecial?: (special: string) => void
  readonly onPlaybackStart?: (text: string) => void
  readonly onPlaybackEnd?: () => void
} & ({
  readonly synthesize: SpeechPipelineOptions<Blob>['tts']
} | {
  /** The provider consumes text and emits audio parts concurrently. Its adapter owns decoding and source coordinates. */
  readonly stream: (text: ReadableStream<string>, signal: AbortSignal) => Promise<ReadableStream<SpeechAudio>>
})

/** One producer owns its text, synthesis, queued audio, and cancellation within a response. */
export class SpeechStream {
  private readonly abort = new AbortController()
  private readonly completion = Promise.withResolvers<{ status: 'finished' } | { status: 'cancelled', reason: string } | { status: 'failed', error: Error }>()
  private readonly intent: IntentHandle | undefined
  private readonly text: ReturnType<typeof createPushStream<string>> | undefined
  private outputReader: ReadableStreamDefaultReader<SpeechAudio> | undefined
  private sealed = false
  private settled = false
  private timer: ReturnType<typeof setTimeout> | undefined
  readonly signal = this.abort.signal
  readonly done = this.completion.promise

  constructor(readonly response: Response, readonly purpose: string, previous: Promise<unknown>, private readonly output: SpeechOutput, deadlineMs?: number) {
    if (deadlineMs !== undefined)
      this.timer = setTimeout(() => this.cancel('Speech deadline ended'), deadlineMs)
    if ('stream' in output) {
      this.text = createPushStream<string>()
      void this.playStream(previous, output.stream)
      return
    }
    const listeners = {
      start: new Set<SpeechPipelineEvents<Blob>['onPlaybackStart']>(),
      end: new Set<SpeechPipelineEvents<Blob>['onPlaybackEnd']>(),
      interrupt: new Set<SpeechPipelineEvents<Blob>['onPlaybackInterrupt']>(),
      reject: new Set<SpeechPipelineEvents<Blob>['onPlaybackReject']>(),
    }
    const pending = new Set<PlaybackItem<Blob>>()
    const pipeline = createSpeechPipeline<Blob>({
      tts: async (request, signal) => {
        try {
          const audio = await output.synthesize(request, AbortSignal.any([signal, this.signal, response.signal]))
          return this.signal.aborted || response.signal.aborted ? null : audio
        }
        catch (cause) {
          this.fail(cause instanceof Error ? cause : new Error('Speech synthesis failed', { cause }))
          return null
        }
      },
      playback: {
        schedule: (item) => {
          pending.add(item)
          let started = false
          void Promise.race([previous, this.done]).then(async () => {
            if (this.signal.aborted || response.signal.aborted)
              return 'stopped' as const
            return response.playback.enqueue({ id: item.id, audio: item.audio, signal: this.signal, onStart: () => {
              started = true
              listeners.start.forEach(listener => listener({ item, startedAt: Date.now() }))
              output.onPlaybackStart?.(item.text)
            } })
          }).then((result) => {
            if (started)
              output.onPlaybackEnd?.()
            if (!pending.delete(item))
              return
            if (result === 'ended')
              listeners.end.forEach(listener => listener({ item, endedAt: Date.now() }))
            else
              listeners.interrupt.forEach(listener => listener({ item, interruptedAt: Date.now(), reason: result }))
            if (result === 'failed')
              this.fail(new Error('Speech playback failed'))
          }, cause => this.fail(cause instanceof Error ? cause : new Error('Speech playback failed', { cause })))
        },
        stopByIntent: (_id, reason) => {
          for (const item of pending)
            listeners.interrupt.forEach(listener => listener({ item, interruptedAt: Date.now(), reason }))
          pending.clear()
        },
        stopAll: reason => this.cancel(reason),
        stopByOwner: (_id, reason) => this.cancel(reason),
        onStart: (listener) => { listeners.start.add(listener) },
        onEnd: (listener) => { listeners.end.add(listener) },
        onInterrupt: (listener) => { listeners.interrupt.add(listener) },
        onReject: (listener) => { listeners.reject.add(listener) },
      },
    })
    pipeline.on('onSpecial', segment => segment.special && output.onSpecial?.(segment.special))
    pipeline.on('onIntentEnd', () => this.settle({ status: 'finished' }))
    this.intent = pipeline.openIntent({ turnId: response.turn.turnId, ownerId: response.turn.sessionId })
  }

  /** Triggering workflow: VoiceController response → provider text stream → reserved playback slot → producer completion. */
  private async playStream(previous: Promise<unknown>, synthesize: Extract<SpeechOutput, { stream: unknown }>['stream']) {
    try {
      const audio = await synthesize(this.text!.stream, AbortSignal.any([this.signal, this.response.signal]))
      await Promise.race([previous, this.done])
      if (this.signal.aborted || this.response.signal.aborted) {
        await audio.cancel('Speech producer closed')
        return
      }
      this.outputReader = audio.getReader()
      const playing: Promise<void>[] = []
      while (!this.signal.aborted && !this.response.signal.aborted) {
        const result = await this.outputReader.read()
        if (result.done)
          break
        const part = result.value
        let started = false
        playing.push(this.response.playback.enqueue({
          id: crypto.randomUUID(),
          audio: part.audio,
          signal: this.signal,
          onStart: () => {
            started = true
            this.output.onPlaybackStart?.(part.text ?? '')
          },
        }).then((status) => {
          if (started)
            this.output.onPlaybackEnd?.()
          if (status === 'failed')
            this.fail(new Error('Speech playback failed'))
        }))
      }
      if (!this.sealed)
        throw new Error('Speech provider completed before text input ended')
      await Promise.all(playing)
      this.settle({ status: 'finished' })
    }
    catch (cause) {
      this.fail(cause instanceof Error ? cause : new Error('Streaming speech failed', { cause }))
    }
    finally {
      this.outputReader?.releaseLock()
      this.outputReader = undefined
    }
  }

  /** Special tokens remain ordered through the chunker. Streaming providers handle these tokens outside their text transport. */
  special(value: string) {
    if (this.sealed || this.response.signal.aborted)
      return
    if (this.intent)
      this.intent.writeSpecial(value)
    else
      this.output.onSpecial?.(value)
  }

  flush() {
    if (!this.sealed)
      this.intent?.writeFlush()
  }

  write(text: string): Promise<{ status: 'accepted' | 'closed' | 'failed' }> {
    if (this.sealed || this.response.signal.aborted)
      return Promise.resolve({ status: 'closed' })
    if (this.text)
      this.text.write(text)
    else
      this.intent!.writeLiteral(text)
    return Promise.resolve({ status: 'accepted' })
  }

  end() {
    if (this.sealed)
      return
    this.sealed = true
    this.text?.close()
    this.intent?.end()
  }

  cancel(reason: string) {
    if (this.settled)
      return
    this.abort.abort(reason)
    this.text?.close()
    void this.outputReader?.cancel('Speech producer closed').catch(() => {})
    this.intent?.cancel(reason)
    this.settle({ status: 'cancelled', reason })
  }

  private fail(error: Error) {
    if (this.settled)
      return
    this.abort.abort(error)
    this.text?.close()
    void this.outputReader?.cancel('Speech producer closed').catch(() => {})
    this.intent?.cancel(error.message)
    this.settle({ status: 'failed', error })
  }

  private settle(outcome: Awaited<SpeechStream['done']>) {
    if (this.settled)
      return
    this.sealed = true
    this.settled = true
    clearTimeout(this.timer)
    this.completion.resolve(outcome)
  }
}

/** Speech producers synthesize concurrently. Their reserved playback order follows creation order. */
export class Response {
  private readonly abort = new AbortController()
  private readonly streams: SpeechStream[] = []
  private ordered: Promise<unknown> = Promise.resolve()
  private sealed = false
  private outcome: 'finished' | 'cancelled' | 'interrupted' | 'failed' | undefined
  private finishing: Promise<'finished' | 'cancelled' | 'interrupted' | 'failed'> | undefined
  private silence: Promise<PlaybackReceipt> | undefined
  readonly signal = this.abort.signal
  readonly playback: PlaybackGroup
  readonly turn: TurnRef

  constructor(turn: TurnRef, private readonly output: SpeechOutput) {
    this.turn = Object.freeze({ ...turn })
    this.playback = output.playback.openGroup(`${turn.sessionId}:${turn.turnId}`)
  }

  get closed(): boolean { return this.outcome !== undefined }

  openSpeech(settings: { purpose: string, deadlineMs?: number }): SpeechStream {
    if (this.sealed)
      throw new Error('Response is closed to new speech')
    if (settings.deadlineMs !== undefined && (!Number.isFinite(settings.deadlineMs) || settings.deadlineMs < 0))
      throw new Error('Speech deadline must be finite and nonnegative')
    const previous = this.ordered
    const stream = new SpeechStream(this, settings.purpose, previous, this.output, settings.deadlineMs)
    this.ordered = Promise.all([previous, stream.done])
    this.streams.push(stream)
    return stream
  }

  finish(): Promise<'finished' | 'cancelled' | 'interrupted' | 'failed'> {
    if (this.finishing)
      return this.finishing
    this.sealed = true
    this.streams.forEach(stream => stream.end())
    this.finishing = (async () => {
      const results = await Promise.all(this.streams.map(stream => stream.done))
      const receipt = await (this.silence ?? this.playback.finish())
      this.outcome ??= receipt.status === 'failed' || results.some(result => result.status === 'failed') ? 'failed' : 'finished'
      return this.outcome
    })()
    return this.finishing
  }

  cancel(reason: string) {
    if (this.closed)
      return
    this.outcome = 'cancelled'
    this.stop(reason, 0)
  }

  /** Triggering workflow: VoiceController.interrupt → close response delivery → fade playback and abort all producers. */
  interrupt(cause: string, fadeMs: number): Promise<PlaybackReceipt> {
    if (!this.closed) {
      this.outcome = 'interrupted'
      this.stop(cause, fadeMs)
    }
    return this.silence ?? this.playback.finish()
  }

  private stop(reason: string, fadeMs: number) {
    this.sealed = true
    // The group installs its fade before stream cancellation requests individual clip stops.
    this.silence = this.playback.stop({ fadeMs })
    this.abort.abort(reason)
    this.streams.forEach(stream => stream.cancel(reason))
  }
}
