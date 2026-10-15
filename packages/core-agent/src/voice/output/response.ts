import type { AudioPlayback, IntentHandle, PcmBlock, PlaybackGroup, PlaybackItem, PlaybackReceipt, SpeechPipelineEvents, SpeechPipelineOptions } from '@proj-airi/pipelines-audio'

import type { TurnRef } from '../turn'

import { errorMessageFrom } from '@moeru/std'
import { createPushStream, createSpeechPipeline } from '@proj-airi/pipelines-audio'
import { APICallError } from '@xsai/shared'
import { nanoid } from 'nanoid/non-secure'

import { errorFromCause, errorMessageFromValue } from '../../utils/error'

/** Complete clips have not reached playback yet, so a rejected request can repeat without repeating local audio. */
const synthesisRetry = {
  /** Two retries keep temporary outages from ending a producer; normal requests have no added delay. */
  backoffMs: [300, 600],
  /** A longer provider wait fails the producer instead of leaving its reserved playback slot pending. */
  maxRetryAfterMs: 30_000,
}

function synthesisRetryDelayMs(cause: unknown, attempt: number): number | undefined {
  const backoffMs = synthesisRetry.backoffMs[attempt]
  if (backoffMs === undefined)
    return undefined

  if (cause instanceof APICallError) {
    if (![408, 425, 429, 500, 502, 503, 504].includes(cause.statusCode))
      return undefined

    // Use the provider's wait when browsers expose it. Otherwise use the short
    // local backoff; error text cannot override an explicit permanent status.
    const retryAfter = cause.responseHeaders['retry-after']
    if (!retryAfter)
      return backoffMs
    const seconds = Number(retryAfter)
    const delayMs = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now()
    if (!Number.isFinite(delayMs))
      return backoffMs
    return delayMs <= synthesisRetry.maxRetryAfterMs ? Math.max(delayMs, 0) : undefined
  }

  // Fetch rejects transport failures as TypeError. Do not retry unrelated
  // TypeErrors, aborts, or arbitrary provider messages that contain a status.
  if (cause instanceof TypeError && /failed to fetch|fetch failed|network error/i.test(errorMessageFrom(cause) ?? ''))
    return backoffMs
  return undefined
}

function waitForSynthesisRetry(delayMs: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason)
      return
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, delayMs)
    signal.addEventListener('abort', onAbort, { once: true })
    function onAbort() {
      clearTimeout(timer)
      reject(signal.reason)
    }
  })
}

/** Each synthesized part carries optional display text. Audio ownership transfers to playback. */
export interface SpeechAudio {
  readonly audio: Blob | ReadableStream<PcmBlock>
  readonly text?: string
}

/**
 * One scheduled audio part. Pipeline synthesis reuses the TTS request segment ID.
 * Tracing can therefore join synthesis and playback of the same text.
 */
export interface SpeechClip {
  readonly id: string
  readonly text: string
}

/** A stopped or failed clip carries the producer or response abort reason when one exists. */
export interface SpeechClipEnd {
  readonly status: 'ended' | 'stopped' | 'failed'
  readonly reason?: string
}

/** Provider settings are selected once when a response opens. */
export type SpeechOutput = {
  readonly playback: AudioPlayback
  readonly onSpecial?: (special: string) => void
  /** Runs when the first audio of a clip is scheduled. */
  readonly onPlaybackStart?: (clip: SpeechClip) => void
  /** Runs once for each started clip after playback ends, stops, or fails. */
  readonly onPlaybackEnd?: (clip: SpeechClip, end: SpeechClipEnd) => void
} & ({
  /** Rejected complete-clip requests can retry twice before the producer fails; `null` means intentional silence. */
  readonly synthesize: SpeechPipelineOptions<Blob>['tts']
} | {
  /** The provider consumes text and emits audio parts concurrently. Its adapter owns decoding and source coordinates. */
  readonly stream: (text: ReadableStream<string>, signal: AbortSignal) => Promise<ReadableStream<SpeechAudio>>
})

/** One producer owns its text, synthesis, queued audio, and cancellation within a response. */
export class SpeechStream {
  private readonly abort = new AbortController()
  private readonly completion = Promise.withResolvers<{ status: 'finished' } | { status: 'cancelled', reason: string } | { status: 'failed', error: Error }>()
  private intent: IntentHandle | undefined
  private text: ReturnType<typeof createPushStream<string>> | undefined
  private outputReader: ReadableStreamDefaultReader<SpeechAudio> | undefined
  private started = false
  private sealed = false
  private settled = false
  private timer: ReturnType<typeof setTimeout> | undefined
  readonly signal = this.abort.signal
  readonly done = this.completion.promise

  constructor(readonly response: VoiceResponse, readonly purpose: string, private readonly output: SpeechOutput) {}

  /** The response registers this stream before it starts synthesis or playback. Setup errors settle `done`. */
  start(previous: Promise<unknown>, deadlineMs?: number) {
    if (this.started)
      throw new Error('Speech stream already started')

    this.started = true

    try {
      this.startProvider(previous, deadlineMs)
    }
    catch (cause) {
      this.fail(errorFromCause(cause, 'Speech stream setup failed'))
    }
  }

  private startProvider(previous: Promise<unknown>, deadlineMs?: number) {
    if (deadlineMs !== undefined)
      this.timer = setTimeout(() => this.cancel('Speech deadline ended'), deadlineMs)

    const { output, response } = this
    if ('stream' in output) {
      this.text = createPushStream<string>()
      void this.playStream(previous, output.stream)
      return
    }

    const listeners = {
      start: new Set<SpeechPipelineEvents<Blob>['onPlaybackStart']>(),
      end: new Set<SpeechPipelineEvents<Blob>['onPlaybackEnd']>(),
      interrupt: new Set<SpeechPipelineEvents<Blob>['onPlaybackInterrupt']>(),
    }
    const pending = new Set<PlaybackItem<Blob>>()
    const pipeline = createSpeechPipeline<Blob>({
      tts: async (request, signal) => {
        try {
          const synthesisSignal = AbortSignal.any([signal, this.signal, response.signal])
          // Retain this request's segment identity and combined cancellation
          // scope across attempts. Only a terminal failure closes the producer.
          for (let attempt = 0; ; attempt++) {
            synthesisSignal.throwIfAborted()
            try {
              const audio = await output.synthesize(request, synthesisSignal)
              synthesisSignal.throwIfAborted()
              return audio
            }
            catch (cause) {
              const delayMs = synthesisSignal.aborted ? undefined : synthesisRetryDelayMs(cause, attempt)
              if (delayMs === undefined)
                throw cause
              await waitForSynthesisRetry(delayMs, synthesisSignal)
            }
          }
        }
        catch (cause) {
          this.fail(errorFromCause(cause, 'Speech synthesis failed'))
          return null
        }
      },
      playback: {
        schedule: (item) => {
          pending.add(item)
          const clip = { id: item.segmentId, text: item.text }
          let started = false
          void Promise.race([previous, this.done]).then(async () => {
            if (this.signal.aborted || response.signal.aborted)
              return 'stopped' as const
            return response.playback.enqueue({ id: item.id, audio: item.audio, signal: this.signal, onStart: () => {
              started = true
              listeners.start.forEach(listener => listener({ item, startedAt: Date.now() }))
              output.onPlaybackStart?.(clip)
            } })
          }).then((result) => {
            if (started)
              output.onPlaybackEnd?.(clip, this.clipEnd(result))
            if (!pending.delete(item))
              return
            if (result === 'ended')
              listeners.end.forEach(listener => listener({ item, endedAt: Date.now() }))
            else
              listeners.interrupt.forEach(listener => listener({ item, interruptedAt: Date.now(), reason: result }))
            if (result === 'failed')
              this.fail(new Error('Speech playback failed'))
          }, cause => this.fail(errorFromCause(cause, 'Speech playback failed')))
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
        // NOTICE:
        // The pipeline requires an onReject callback, but this adapter accepts every item.
        // Playback failures arrive through the enqueue receipt above.
        // Remove this callback when the playback adapter makes onReject optional.
        onReject: () => {},
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
        const clip = { id: nanoid(), text: part.text ?? '' }
        let started = false
        playing.push(this.response.playback.enqueue({
          id: clip.id,
          audio: part.audio,
          signal: this.signal,
          onStart: () => {
            started = true
            this.output.onPlaybackStart?.(clip)
          },
        }).then((status) => {
          if (started)
            this.output.onPlaybackEnd?.(clip, this.clipEnd(status))
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
      this.fail(errorFromCause(cause, 'Streaming speech failed'))
    }
    finally {
      this.outputReader?.releaseLock()
      this.outputReader = undefined
    }
  }

  private clipEnd(status: SpeechClipEnd['status']): SpeechClipEnd {
    if (status === 'ended')
      return { status }

    // The producer signal aborts first for its own cancellation. Response interruption covers every producer.
    const signal = this.signal.aborted ? this.signal : this.response.signal
    return signal.aborted ? { status, reason: errorMessageFromValue(signal.reason) } : { status }
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

  write(text: string): { status: 'accepted' | 'closed' } {
    if (this.sealed || this.response.signal.aborted)
      return { status: 'closed' }
    if (this.text)
      this.text.write(text)
    else
      this.intent!.writeLiteral(text)

    return { status: 'accepted' }
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
export class VoiceResponse {
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

  constructor(turn: TurnRef, private readonly output: SpeechOutput, private readonly onClosed: () => void) {
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
    const stream = new SpeechStream(this, settings.purpose, this.output)
    this.ordered = Promise.all([previous, stream.done])
    this.streams.push(stream)
    stream.start(previous, settings.deadlineMs)

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

    void this.finishing.then(this.onClosed, this.onClosed)
    return this.finishing
  }

  cancel(reason: string) {
    if (this.closed)
      return
    this.outcome = 'cancelled'
    this.stop(reason, 0)
    void this.finish().catch(() => {})
  }

  /** Triggering workflow: VoiceController.interrupt → close response delivery → fade playback and abort all producers. */
  interrupt(cause: string, fadeMs: number): Promise<PlaybackReceipt> {
    if (!this.closed) {
      this.outcome = 'interrupted'
      this.stop(cause, fadeMs)
      void this.finish().catch(() => {})
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
