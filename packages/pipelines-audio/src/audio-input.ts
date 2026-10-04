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

/**
 * Settlement shared by captures, observers, and their callers.
 *
 * Operational failure resolves completion. Invalid configuration throws before allocation.
 */
export type Outcome<T = void>
  = { readonly status: 'finished', readonly value: T }
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

/**
 * Keeps retained history from a position while its signal is active.
 *
 * The holder moves the position forward as its work completes. A position from an older connection
 * adds no requirement. Before the first block of a connection, the lease holds that connection from its start.
 */
export interface HistoryLease {
  hold: (from: Position) => void
}

interface Lease {
  from: Position | undefined
}

function blockMs(block: PcmBlock) {
  return (block.range.endFrame - block.range.startFrame) * 1000 / block.sampleRate
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
  private readonly leases = new Set<Lease>()
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
   *
   * A live source cannot wait for a slow reader. When unread audio exceeds `maxBufferedMs`, only this
   * subscription errors, so one stalled consumer cannot grow memory without limit or stop the others.
   */
  subscribe(options: {
    from?: Position
    signal?: AbortSignal
    /** @default 60000. Unread audio that this subscription can queue before it errors. */
    maxBufferedMs?: number
  } = {}): ReadableStream<PcmBlock> {
    const maxBufferedMs = options.maxBufferedMs ?? 60_000
    if (!Number.isFinite(maxBufferedMs) || maxBufferedMs <= 0)
      throw new Error('Subscription buffer duration must be finite and positive')

    const scope = createScope(options.signal)
    let subscriber: Subscriber | undefined
    const stream = new ReadableStream<PcmBlock>({
      start: output => void (subscriber = { scope, output }),
      cancel: reason => scope.close(reason),
    }, { highWaterMark: maxBufferedMs, size: blockMs })
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

  /** Keeps history for a holder, such as a detector whose result can start a capture before its window. */
  retain(signal: AbortSignal): HistoryLease {
    const lease: Lease = { from: this.current }
    if (!signal.aborted) {
      this.leases.add(lease)
      signal.addEventListener('abort', () => this.leases.delete(lease), { once: true })
    }
    return { hold: (from) => {
      lease.from = from
    } }
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

    // A lease from an older connection, or one taken before any connection, holds this connection from its start.
    if (!sameSource) {
      for (const lease of this.leases)
        lease.from = { sourceId: block.range.sourceId, frame: block.range.startFrame }
    }

    this.current = { sourceId: block.range.sourceId, frame: block.range.endFrame }
    this.rate = block.sampleRate
    this.history.push(block)
    for (const subscriber of this.subscribers) {
      if ((subscriber.output.desiredSize ?? 0) < 0) {
        subscriber.output.error(new Error('Audio subscriber fell behind'))
        void subscriber.scope.close('Audio subscriber fell behind')
        continue
      }
      subscriber.output.enqueue(block)
    }
    this.trimHistory(block.sampleRate)
  }

  private trimHistory(sampleRate: number) {
    let retainedFrom = this.current!.frame - Math.floor((this.options.historyMs ?? 0) * sampleRate / 1000)
    for (const lease of this.leases) {
      if (lease.from?.sourceId === this.current!.sourceId)
        retainedFrom = Math.min(retainedFrom, lease.from.frame)
    }
    while (this.history.length && this.history[0].range.endFrame <= retainedFrom)
      this.history.shift()
    if (this.history.length && this.history[0].range.startFrame < retainedFrom)
      this.history[0] = sliceBlock(this.history[0], retainedFrom)
  }
}
