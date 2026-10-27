import type { AudioPlayback, IntentHandle, PcmBlock, PlaybackGroup, PlaybackItem, PlaybackReceipt, SpeechPipelineEvents, SpeechPipelineOptions } from '@proj-airi/pipelines-audio'
import type { Outcome } from '@proj-airi/stream-kit'

import type { TurnRef } from '../turn'

import { createSpeechPipeline } from '@proj-airi/pipelines-audio'
import { createPushStream } from '@proj-airi/stream-kit'
import { nanoid } from 'nanoid/non-secure'

import { errorFromCause, errorMessageFromValue } from '../../utils/error'
import { toSpeechText } from './speech-transformation'
import { MarkdownSegmenter } from './speech-transformation/segmenter'

/** Each synthesized part carries optional display text. Audio ownership transfers to playback. */
export interface SpeechAudio {
  readonly audio: Blob | ReadableStream<PcmBlock>
  // REVIEW: I am wondering, is text enough here?
  // Should we consider more richtext friendly design
  // or consider more structural design here?
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
  /** BCP 47 code of the voice. The words around a formula or a price select its language first. */
  readonly language?: string
} & ({
  readonly synthesize: SpeechPipelineOptions<Blob>['tts']
} | {
  /** The provider consumes text and emits audio parts concurrently. Its adapter owns decoding and source coordinates. */
  readonly stream: (text: ReadableStream<string>, signal: AbortSignal) => Promise<ReadableStream<SpeechAudio>>
})

/**
 * Marks where a special token or a flush occurs in the streamed text, so that markdown conversion keeps its position.
 * It is a Unicode private use character. Model text does not contain it, and producer text is stripped of it.
 */
const controlMarker = '\uE000'

type SpeechControl = { readonly type: 'special', readonly value: string } | { readonly type: 'flush' }

// REVIEW: this doesn't look like the native Speech Stream, i'd rather to believe this is
// naive wrapper and design for speech without much abstraction
/** One producer owns its text, synthesis, queued audio, and cancellation within a response. */
export class SpeechStream {
  private readonly abort = new AbortController()
  private readonly completion = Promise.withResolvers<Outcome>()

  private intent: IntentHandle | undefined

  private text: ReturnType<typeof createPushStream<string>> | undefined
  private outputReader: ReadableStreamDefaultReader<SpeechAudio> | undefined

  private started = false
  private sealed = false
  private settled = false

  private timer: ReturnType<typeof setTimeout> | undefined
  /** Holds the text after the last safe end of the streamed markdown. A control marker holds the place of a control. */
  private readonly segmenter = new MarkdownSegmenter()
  /** Controls whose markers are still in the segmenter, in order. */
  private readonly controls: SpeechControl[] = []
  /** The spoken text of the last segment, for the language of a formula that starts the next one. */
  private spoken = ''
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
          const audio = await output.synthesize(request, AbortSignal.any([signal, this.signal, response.signal]))
          return this.signal.aborted || response.signal.aborted ? null : audio
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
          void Promise.race([previous, this.done])
            .then(async () => {
              if (this.signal.aborted || response.signal.aborted)
                return 'stopped' as const

              return response.playback.enqueue({
                id: item.id,
                audio: item.audio,
                signal: this.signal,
                onStart: () => {
                  started = true
                  listeners.start.forEach(listener => listener({ item, startedAt: Date.now() }))
                  output.onPlaybackStart?.(clip)
                },
              })
            })
            .then((result) => {
              if (started)
                output.onPlaybackEnd?.(clip, this.clipEnd(result))

              if (!pending.delete(item))
                return

              if (result === 'ended')
                listeners.end.forEach(listener => listener({ item, endedAt: Date.now() }))
              else
                listeners.interrupt.forEach(listener => listener({ item, interruptedAt: Date.now(), reason: result }))

              // REVIEW: can we have more manage-able error handling
              // across our pipelines?
              if (result === 'failed')
                this.fail(new Error('Speech playback failed'))
            // REVIEW: must we do this here?
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
    pipeline.on('onIntentEnd', () => this.settle({ status: 'finished', value: undefined }))

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
      this.settle({ status: 'finished', value: undefined })
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

  // Text streams to TTS by segments, so an answer starts to speak after its first sentence. The segmenter ends a segment
  // only where markdown parses alone: a formula, a code block, or a link that is still open waits for its end.

  /** Special tokens keep their position relative to the text. */
  special(value: string) {
    if (this.sealed || this.response.signal.aborted)
      return

    this.controls.push({ type: 'special', value })
    this.deliver(this.segmenter.push(controlMarker))
  }

  /** Sends the text so far, unless a formula or another construct is still open. Then the flush follows its end. */
  flush() {
    if (this.sealed)
      return

    this.controls.push({ type: 'flush' })
    this.deliver([...this.segmenter.push(controlMarker), ...this.segmenter.flush()])
  }

  write(text: string): { status: 'accepted' | 'closed' } {
    if (this.sealed || this.response.signal.aborted)
      return { status: 'closed' }

    this.deliver(this.segmenter.push(text.replaceAll(controlMarker, '')))
    return { status: 'accepted' }
  }

  end() {
    if (this.sealed)
      return

    if (!this.response.signal.aborted)
      this.deliver(this.segmenter.end())
    this.sealed = true
    this.text?.close()
    this.intent?.end()
  }

  /**
   * Sends each segment as speech text, with its controls in source order. Controls that conversion lost are sent after
   * the text of their segment, in order.
   */
  private deliver(segments: readonly string[]) {
    if (this.response.signal.aborted)
      return

    for (const segment of segments) {
      const count = segment.split(controlMarker).length - 1
      const controls = this.controls.splice(0, count)
      const parts = toSpeechText(segment, { marker: controlMarker, language: this.output.language, before: this.spoken }).split(controlMarker)
      // Segments end inside a paragraph or between blocks. The space or the line break between them stays for TTS.
      const separator = /\n\s*$/.test(segment) ? '\n' : /[ \t]$/.test(segment) ? ' ' : ''
      parts.forEach((text, index) => {
        const last = index === parts.length - 1
        const spoken = last && text ? text + separator : text
        if (spoken)
          this.deliverText(spoken)
        if (text.trim())
          this.spoken = text

        const control = controls[index]
        if (control && !last)
          this.deliverControl(control)
      })
      controls.slice(parts.length - 1).forEach(control => this.deliverControl(control))
      // NOTICE:
      // The TTS chunker reads one grapheme past a sentence end, to tell `3.14` and `...` from an end. Without more text,
      // the last sentence of a segment waits for the next segment, which can be a long formula or code block.
      // Source: chunkTtsInput in packages/pipelines-audio/src/processors/tts-chunker.ts.
      // Remove when the chunker ends a chunk at the end of its input without lookahead.
      this.intent?.writeFlush()
    }
  }

  private deliverText(text: string) {
    if (this.text)
      this.text.write(text)
    else
      this.intent!.writeLiteral(text)
  }

  /** The chunker orders special tokens with the audio. Streaming providers handle them outside their text transport. */
  private deliverControl(control: SpeechControl) {
    if (control.type === 'flush')
      this.intent?.writeFlush()
    else if (this.intent)
      this.intent.writeSpecial(control.value)
    else
      this.output.onSpecial?.(control.value)
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

  private settle(outcome: Outcome) {
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
