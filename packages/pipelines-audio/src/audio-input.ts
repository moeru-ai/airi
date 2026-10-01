import type { Scope } from './scope'

import { createScope } from './scope'

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

/** Operational failure resolves completion. Invalid configuration throws before allocation. */
export type Outcome<T>
  = { readonly status: 'finished', readonly value: T, readonly range: AudioRange }
    | { readonly status: 'cancelled', readonly reason: string }
    | { readonly status: 'failed', readonly error: Error }

/**
 * Anything that produces PCM: a microphone, a borrowed MediaStream, or a decoded file.
 *
 * `open` starts permission or device work synchronously, so a click handler can start a microphone.
 * Each call is one connection with its own `sourceId`. Aborting `signal` releases everything that call opened.
 */
export interface AudioInputSource {
  open: (signal: AbortSignal) => ReadableStream<PcmBlock>
}

interface Subscriber {
  readonly scope: Scope
  readonly output: ReadableStreamDefaultController<PcmBlock>
}

function sliceBlock(block: PcmBlock, startFrame: number): PcmBlock {
  return {
    ...block,
    range: { ...block.range, startFrame },
    channels: block.channels.map(channel => channel.slice(startFrame - block.range.startFrame)),
  }
}

function isValidBlock(block: PcmBlock, frame: number | undefined) {
  const { startFrame, endFrame } = block.range
  return Number.isSafeInteger(startFrame)
    && Number.isSafeInteger(endFrame)
    && endFrame > startFrame
    && (frame === undefined || startFrame >= frame)
    && Number.isFinite(block.sampleRate) && block.sampleRate > 0
    && block.channels.length > 0
    && block.channels.every(channel => channel.length === endFrame - startFrame)
}

/**
 * Shares one source between independent subscribers.
 *
 * The first subscriber opens the source and the last one to leave closes it. Each subscription can
 * replay retained history from an earlier position, so speech that started before detection is kept.
 *
 * State model:
 * - connection: the open source call, present only while subscribers exist.
 * - position and history: coordinates and samples of the current connection. A new connection resets both.
 * - retainers: callers such as detectors that need history older than `historyMs`.
 */
export class AudioInput {
  private connection: Scope | undefined
  private readonly subscribers = new Set<Subscriber>()
  private readonly retainers = new Set<() => number | undefined>()
  private readonly history: PcmBlock[] = []
  private current: Position | undefined
  private rate: number | undefined

  constructor(private readonly source: AudioInputSource, private readonly options: {
    /** @default 0. Keeps this much recent audio for subscriptions that start from an earlier position. */
    historyMs?: number
  } = {}) {
    if (!Number.isFinite(options.historyMs ?? 0) || (options.historyMs ?? 0) < 0)
      throw new Error('History duration must be finite and nonnegative')
  }

  /** Undefined until the current connection delivers its first block. */
  get position(): Position | undefined {
    return this.current
  }

  get sampleRate(): number | undefined {
    return this.rate
  }

  /**
   * Streams accepted blocks until `signal` aborts, the stream is cancelled, or the source ends.
   *
   * With `from`, the stream first replays retained history from that position. Missing history errors the stream.
   * Source failure errors every subscriber. Source completion closes them.
   */
  subscribe(options: { from?: Position, signal?: AbortSignal } = {}): ReadableStream<PcmBlock> {
    const scope = createScope(options.signal)
    let subscriber: Subscriber | undefined
    const stream = new ReadableStream<PcmBlock>({
      start: output => void (subscriber = { scope, output }),
      cancel: reason => scope.close(reason),
    })
    const { from } = options
    const replay = from ? this.historyFrom(from) : []
    if (!replay) {
      subscriber!.output.error(new Error('Audio history is unavailable'))
      void scope.close()
      return stream
    }

    replay.forEach(block => subscriber!.output.enqueue(block))
    this.subscribers.add(subscriber!)
    scope.defer(() => {
      this.subscribers.delete(subscriber!)
      try {
        subscriber!.output.close()
      }
      catch {
        // The consumer already cancelled or the source already errored this stream.
      }
      if (!this.subscribers.size)
        void this.connection?.close('No audio subscribers')
    })
    if (!scope.signal.aborted)
      this.connect()
    return stream
  }

  /** Keeps history from the returned frame while `signal` is active. Undefined adds no requirement. */
  retain(frame: () => number | undefined, signal: AbortSignal) {
    if (signal.aborted)
      return
    this.retainers.add(frame)
    signal.addEventListener('abort', () => this.retainers.delete(frame), { once: true })
  }

  /** Ends every subscription and releases the source. Later subscriptions reopen it. */
  close() {
    for (const subscriber of this.subscribers)
      void subscriber.scope.close('Audio input closed')
    return this.connection?.closed ?? Promise.resolve()
  }

  private historyFrom(from: Position): PcmBlock[] | undefined {
    const oldest = this.history[0]?.range.startFrame ?? this.current?.frame
    if (!this.current || from.sourceId !== this.current.sourceId || oldest === undefined || from.frame < oldest || from.frame > this.current.frame)
      return undefined
    return this.history
      .filter(block => block.range.endFrame > from.frame)
      .map(block => block.range.startFrame < from.frame ? sliceBlock(block, from.frame) : block)
  }

  private connect() {
    // A closing connection still exists until its cleanup runs. A new subscriber must not wait for it.
    if (this.connection && !this.connection.signal.aborted)
      return

    const connection = createScope()
    this.connection = connection
    connection.defer(() => {
      // A newer connection owns the shared state after a quick resubscribe.
      if (this.connection !== connection)
        return
      this.connection = undefined
      this.history.length = 0
      this.current = undefined
      this.rate = undefined
    })
    void this.read(connection)
  }

  /** Triggering workflow: first subscriber → source.open → accepted blocks → subscribers and history. */
  private async read(connection: Scope) {
    let reader: ReadableStreamDefaultReader<PcmBlock> | undefined
    try {
      reader = this.source.open(connection.signal).getReader()
      connection.defer(() => reader?.cancel(connection.signal.reason).catch(() => {}))
      while (!connection.signal.aborted) {
        const { done, value: block } = await reader.read()
        if (done || connection.signal.aborted)
          break

        this.accept(block)
      }
      // A connection closed for lack of subscribers must not end subscribers of a newer connection.
      if (!connection.signal.aborted) {
        for (const subscriber of this.subscribers)
          void subscriber.scope.close('Audio source ended')
      }
    }
    catch (cause) {
      const error = cause instanceof Error ? cause : new Error('Audio source failed', { cause })
      if (!connection.signal.aborted) {
        for (const subscriber of this.subscribers) {
          subscriber.output.error(error)
          void subscriber.scope.close(error)
        }
      }
    }
    finally {
      void connection.close()
    }
  }

  private accept(block: PcmBlock) {
    // A new connection starts new coordinates. A gap inside one connection keeps them but drops history.
    const sameSource = this.current?.sourceId === block.range.sourceId
    if (!isValidBlock(block, sameSource ? this.current?.frame : undefined))
      throw new Error('Invalid source audio block')
    if (sameSource && this.rate !== block.sampleRate)
      throw new Error('Audio format changed within a source connection')
    if (!sameSource || block.range.startFrame !== this.current?.frame)
      this.history.length = 0

    this.current = { sourceId: block.range.sourceId, frame: block.range.endFrame }
    this.rate = block.sampleRate
    this.history.push(block)
    for (const subscriber of this.subscribers)
      subscriber.output.enqueue(block)
    this.trimHistory(block.sampleRate)
  }

  private trimHistory(sampleRate: number) {
    let retainedFrom = this.current!.frame - Math.floor((this.options.historyMs ?? 0) * sampleRate / 1000)
    for (const retainer of this.retainers)
      retainedFrom = Math.min(retainedFrom, retainer() ?? retainedFrom)
    while (this.history.length && this.history[0].range.endFrame <= retainedFrom)
      this.history.shift()
    if (this.history.length && this.history[0].range.startFrame < retainedFrom)
      this.history[0] = sliceBlock(this.history[0], retainedFrom)
  }
}
