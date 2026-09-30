import type { Detector, Observation, Observer, WindowOptions } from './audio-observer'
import type { StreamController } from './stream'

import { AudioObserver } from './audio-observer'
import { createPushStream } from './stream'

/** Frame coordinates belong to one source connection and never cross a device change. */
export interface Position {
  readonly sourceId: string
  readonly frame: number
}

/** The sample interval is half-open. */
export interface AudioRange {
  readonly sourceId: string
  readonly startFrame: number
  readonly endFrame: number
}

/** Channels contain planar samples. Consumers must not mutate shared source samples. */
export interface PcmBlock {
  readonly range: AudioRange
  readonly sampleRate: number
  readonly channels: readonly Float32Array[]
}

/** Ownership transfers to AudioInput. Close releases only the adapter's resources. */
export interface AudioSource {
  readonly id: string
  readonly frames: ReadableStream<PcmBlock>
  close: () => Promise<void>
}

/** Format conversion belongs to the injected codec, outside capture lifecycle management. */
export interface FileOptions {
  readonly mimeType: string
  readonly sampleRate: number
  readonly channels: 1 | 2
}

/** Platform and codec adapters are supplied at application setup. */
export interface MediaAdapters {
  supportsFile: (options: FileOptions) => boolean
  encode: (frames: ReadableStream<PcmBlock>, options: FileOptions, signal: AbortSignal) => Promise<Blob>
  nativeStream?: (frames: ReadableStream<PcmBlock>, signal: AbortSignal) => {
    readonly media: MediaStream
    readonly done: Promise<void>
  }
}

/** Operational failure resolves completion. Invalid configuration throws before allocation. */
export type Outcome<T>
  = { readonly status: 'finished', readonly value: T, readonly range: AudioRange }
    | { readonly status: 'cancelled', readonly reason: string }
    | { readonly status: 'failed', readonly error: Error }

/** Finish seals audio immediately. Cancellation also wins during asynchronous codec finalization. */
export interface Capture<T> {
  readonly done: Promise<Outcome<T>>
  finish: () => Promise<Outcome<T>>
  cancel: (reason: string) => void
}

/** Cancelling the readable output cancels this capture, without closing its shared source. */
export interface LiveCapture<T, R = void> extends Capture<R> {
  readonly media: T
}

/** Omitted history starts at the current accepted source position. */
export interface CaptureOptions {
  readonly from?: Position
  readonly signal?: AbortSignal
}

interface CaptureSink {
  push: (block: PcmBlock) => void
  finish: () => Promise<Outcome<unknown>>
  cancel: (reason: string) => void
  sourceFailed: (error: Error) => void
}

function sliceBlock(block: PcmBlock, startFrame: number): PcmBlock {
  return {
    ...block,
    range: { ...block.range, startFrame },
    channels: block.channels.map(channel => channel.slice(startFrame - block.range.startFrame)),
  }
}

class PcmCapture<R = void> implements LiveCapture<ReadableStream<PcmBlock>, R>, CaptureSink {
  private readonly completion = Promise.withResolvers<Outcome<R>>()
  private readonly output: StreamController<PcmBlock>
  private readonly codecOutput: StreamController<PcmBlock> | undefined
  private readonly abort = new AbortController()
  private readonly encoded: Promise<R>
  private endFrame: number
  private sealed = false
  private settled = false
  readonly done = this.completion.promise
  readonly media: ReadableStream<PcmBlock>

  constructor(private readonly from: Position, private readonly release: () => void, encode: (frames: ReadableStream<PcmBlock>, signal: AbortSignal) => Promise<R>, fileOnly = false) {
    this.endFrame = from.frame
    this.output = createPushStream<PcmBlock>(reason => this.cancel(typeof reason === 'string' ? reason : 'Output cancelled'))
    this.media = this.output.stream
    this.codecOutput = fileOnly ? this.output : createPushStream<PcmBlock>()
    try {
      this.encoded = encode(this.codecOutput.stream, this.abort.signal)
    }
    catch (cause) {
      this.encoded = Promise.reject(cause)
    }
    void this.encoded.catch(cause => this.fail(cause instanceof Error ? cause : new Error('Audio encoding failed', { cause })))
  }

  bind(signal?: AbortSignal) {
    if (signal) {
      const abort = () => this.cancel('Capture aborted')
      signal.addEventListener('abort', abort, { once: true })
      void this.done.then(() => signal.removeEventListener('abort', abort))
      if (signal.aborted)
        abort()
    }
  }

  push(block: PcmBlock) {
    if (this.sealed)
      return
    this.endFrame = block.range.endFrame
    this.output.write(block)
    if (this.codecOutput !== this.output)
      this.codecOutput?.write(block)
  }

  finish() {
    if (!this.sealed) {
      this.sealed = true
      this.output.close()
      this.codecOutput?.close()
      void this.encoded.then((value) => {
        if (!this.settled)
          this.settle({ status: 'finished', value, range: { sourceId: this.from.sourceId, startFrame: this.from.frame, endFrame: this.endFrame } })
      }, () => {})
    }
    return this.done
  }

  cancel(reason: string) {
    if (this.settled)
      return
    this.sealed = true
    this.abort.abort(reason)
    this.output.error(new Error(reason))
    this.codecOutput?.error(new Error(reason))
    this.settle({ status: 'cancelled', reason })
  }

  sourceFailed(error: Error) {
    if (!this.sealed)
      this.fail(error)
  }

  fail(error: Error) {
    if (this.settled)
      return
    this.sealed = true
    this.abort.abort(error)
    this.output.error(error)
    this.codecOutput?.error(error)
    this.settle({ status: 'failed', error })
  }

  private settle(outcome: Outcome<R>) {
    this.settled = true
    this.release()
    this.completion.resolve(outcome)
  }
}

/** Owns one source reader and independent captures. Closing the input cancels its children before releasing the source. */
export class AudioInput {
  private readonly reader: ReadableStreamDefaultReader<PcmBlock>
  private readonly captures = new Set<CaptureSink>()
  private readonly observers = new Set<Pick<AudioObserver<unknown>, 'push' | 'cancel' | 'fail' | 'retainedFrom'>>()
  private frame = 0
  private readonly history: PcmBlock[] = []
  private sourceEnded = false
  private format: { sampleRate: number, channels: number } | undefined
  private closed = false
  private closing: Promise<void> | undefined
  readonly capabilities: { readonly nativeStream: boolean, readonly supportsFile: (options: FileOptions) => boolean }

  constructor(private readonly source: AudioSource, private readonly adapters: MediaAdapters, private readonly options: {
    /** @default 0. Retain only the pre-roll interval requested by the caller. */
    historyMs?: number
  } = {}) {
    if (!Number.isFinite(options.historyMs ?? 0) || (options.historyMs ?? 0) < 0)
      throw new Error('History duration must be finite and nonnegative')
    this.reader = source.frames.getReader()
    this.capabilities = { nativeStream: !!adapters.nativeStream, supportsFile: options => adapters.supportsFile(options) }
    void this.readSource()
  }

  get position(): Position {
    return { sourceId: this.source.id, frame: this.frame }
  }

  /** The rate becomes available after the first source block. Pre-roll uses source frames, not wall time. */
  get sampleRate(): number | undefined {
    return this.format?.sampleRate
  }

  capture(options: CaptureOptions & { delivery: 'file', file: FileOptions }): Capture<Blob>
  capture(options: CaptureOptions & { delivery: 'pcm-and-file', file: FileOptions }): LiveCapture<ReadableStream<PcmBlock>, Blob>
  capture(options: CaptureOptions & { delivery: 'pcm' }): LiveCapture<ReadableStream<PcmBlock>>
  capture(options: CaptureOptions & { delivery: 'media-stream' }): LiveCapture<MediaStream>
  capture(options: CaptureOptions & ({ delivery: 'pcm' | 'media-stream' } | { delivery: 'file' | 'pcm-and-file', file: FileOptions })): Capture<unknown> {
    if (this.closed)
      throw new Error('Audio input is closed')
    const from = options.from ?? this.position
    if (!Number.isSafeInteger(from.frame) || from.frame < 0)
      throw new Error('Capture position must be a nonnegative frame')
    if ('file' in options && !this.adapters.supportsFile(options.file))
      throw new Error('Unsupported audio file format')
    if (options.delivery === 'media-stream' && !this.adapters.nativeStream)
      throw new Error('Native audio output is unavailable')
    let startNative: () => MediaStream = () => {
      throw new Error('Native audio output is unavailable')
    }
    const capture = new PcmCapture<Blob | void>(from, () => this.captures.delete(capture), (frames, signal) => {
      if ('file' in options)
        return this.adapters.encode(frames, options.file, signal)
      if (options.delivery === 'media-stream') {
        const delivery = Promise.withResolvers<void>()
        let output: ReturnType<NonNullable<MediaAdapters['nativeStream']>> | undefined
        startNative = () => {
          signal.throwIfAborted()
          output ??= this.adapters.nativeStream!(frames, signal)
          delivery.resolve(output.done)
          return output.media
        }
        return delivery.promise
      }
      return Promise.resolve()
    }, options.delivery !== 'pcm-and-file')
    this.captures.add(capture)
    capture.bind(options.signal)
    if (this.sourceEnded || from.sourceId !== this.source.id || from.frame > this.frame || from.frame < (this.history[0]?.range.startFrame ?? this.frame)) {
      capture.fail(new Error('Audio history is unavailable'))
    }
    else {
      for (const block of this.history) {
        if (block.range.endFrame > from.frame)
          capture.push(sliceBlock(block, Math.max(from.frame, block.range.startFrame)))
      }
    }
    void capture.done.then(() => this.captures.delete(capture))
    if (options.delivery === 'media-stream') {
      const output = {
        get media(): MediaStream {
          try {
            return startNative()
          }
          catch (cause) {
            capture.fail(cause instanceof Error ? cause : new Error('Native audio output failed', { cause }))
            throw cause
          }
        },
        done: capture.done,
        finish: () => capture.finish(),
        cancel: (reason: string) => capture.cancel(reason),
      }
      return output
    }
    return capture
  }

  close(): Promise<void> {
    if (this.closing)
      return this.closing
    this.closed = true
    for (const capture of this.captures)
      capture.cancel('Audio input closed')
    for (const observer of this.observers)
      observer.cancel()
    this.history.length = 0
    this.closing = (this.sourceEnded ? Promise.resolve() : this.reader.cancel()).finally(() => this.source.close())
    return this.closing
  }

  observe<T>(options: WindowOptions, detector: Detector<T>, onResult: (result: Observation<T>) => void): Observer {
    if (this.closed || this.sourceEnded)
      throw new Error('Audio input is closed')
    const observer = new AudioObserver(options, detector, onResult)
    this.observers.add(observer)
    void observer.done.then(() => this.observers.delete(observer))
    return observer
  }

  /**
   * Triggering workflow: {@link AudioSource.frames} → source read → capture output and completion.
   * A source failure fails all captures. Normal source completion seals their audio without aborting consumers.
   */
  private async readSource() {
    try {
      while (!this.closed) {
        const result = await this.reader.read()
        if (this.closed)
          return
        if (result.done) {
          this.sourceEnded = true
          for (const capture of this.captures)
            void capture.finish()
          for (const observer of this.observers)
            observer.cancel()
          return
        }
        const block = result.value
        if (block.range.sourceId !== this.source.id
          || !Number.isSafeInteger(block.range.startFrame)
          || !Number.isSafeInteger(block.range.endFrame)
          || block.range.startFrame < this.frame
          || block.range.endFrame <= block.range.startFrame
          || !Number.isFinite(block.sampleRate) || block.sampleRate <= 0
          || !block.channels.length
          || block.channels.some(channel => channel.length !== block.range.endFrame - block.range.startFrame)) {
          throw new Error('Invalid source audio block')
        }
        if (this.format && (this.format.sampleRate !== block.sampleRate || this.format.channels !== block.channels.length))
          throw new Error('Audio format changed within a source connection')
        this.format = { sampleRate: block.sampleRate, channels: block.channels.length }
        if (block.range.startFrame !== this.frame) {
          this.history.length = 0
          for (const capture of this.captures)
            capture.sourceFailed(new Error('Audio source has a gap'))
        }
        this.frame = block.range.endFrame
        this.history.push(block)
        for (const capture of this.captures)
          capture.push(block)
        for (const observer of this.observers)
          observer.push(block)
        let retainedFrom = this.frame - Math.floor((this.options.historyMs ?? 0) * block.sampleRate / 1000)
        for (const observer of this.observers)
          retainedFrom = Math.min(retainedFrom, observer.retainedFrom ?? retainedFrom)
        while (this.history[0]?.range.endFrame <= retainedFrom)
          this.history.shift()
        if (this.history[0]?.range.startFrame < retainedFrom)
          this.history[0] = sliceBlock(this.history[0], retainedFrom)
      }
    }
    catch (cause) {
      this.sourceEnded = true
      const error = cause instanceof Error ? cause : new Error('Audio source failed', { cause })
      for (const capture of this.captures)
        capture.sourceFailed(error)
      for (const observer of this.observers)
        observer.fail(error)
    }
    finally {
      this.reader.releaseLock()
    }
  }
}
