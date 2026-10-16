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
 * Each call is one connection with a new `sourceId`. Aborting `signal` releases everything that call opened.
 * The reader of the returned stream sets its pace when the source can wait, as a file can.
 */
export interface AudioSource {
  open: (signal: AbortSignal) => ReadableStream<PcmBlock>
}

/**
 * A source that produces audio in real time and cannot wait for its reader, for example a microphone.
 *
 * Only a live source can be shared through {@link AudioInput}. A file is not live.
 * Each consumer of a file opens its own stream, which keeps native backpressure.
 */
export interface LiveAudioSource extends AudioSource {
  readonly live: true
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

/**
 * State of one open source call.
 *
 * Each connection owns its subscribers, coordinates, and history. A new connection starts empty,
 * so no state of an earlier connection can reach its subscribers.
 */
interface Connection {
  readonly scope: Scope
  readonly subscribers: Set<Subscriber>
  readonly history: PcmBlock[]
  /** Undefined until the first block. Then the end of the last accepted block. */
  position: Position | undefined
  sampleRate: number | undefined
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

function historyFrom(connection: Connection, from: Position): PcmBlock[] | undefined {
  const { history, position } = connection
  const oldest = history[0]?.range.startFrame ?? position?.frame
  if (!position || from.sourceId !== position.sourceId || oldest === undefined || from.frame < oldest || from.frame > position.frame)
    return undefined
  return history
    .filter(block => block.range.endFrame > from.frame)
    .map(block => block.range.startFrame < from.frame ? sliceBlock(block, from.frame) : block)
}

/**
 * Shares one live source between independent subscribers.
 *
 * The first subscriber opens the source and the last one to leave closes it. Each subscription can
 * replay retained history from an earlier position, so speech that started before detection is kept.
 * A slow subscriber fails alone, because a live source cannot wait for it.
 *
 * State model:
 * - connection: the open source call with its subscribers, coordinates, and history. Present only while subscribers exist.
 * - leases: callers such as detectors that need history older than `historyMs`. They outlive connections.
 * - previousSourceId: the id of the last connection, so that a source that reuses it fails instead of mixing coordinates.
 */
export class AudioInput {
  private connection: Connection | undefined
  private readonly leases = new Set<Lease>()
  private previousSourceId: string | undefined

  constructor(private readonly source: LiveAudioSource, private readonly options: {
    /** @default 0. Keeps this much recent audio for subscriptions that start from an earlier position. */
    historyMs?: number
  } = {}) {
    if (!Number.isFinite(options.historyMs ?? 0) || (options.historyMs ?? 0) < 0)
      throw new Error('History duration must be finite and nonnegative')
  }

  /** Undefined until the current connection delivers its first block, and after it closes. */
  get position(): Position | undefined {
    return this.open?.position
  }

  get sampleRate(): number | undefined {
    return this.open?.sampleRate
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
    let output: ReadableStreamDefaultController<PcmBlock> | undefined
    const stream = new ReadableStream<PcmBlock>({
      start: controller => void (output = controller),
      cancel: reason => scope.close(reason),
    }, { highWaterMark: maxBufferedMs, size: blockMs })
    if (scope.signal.aborted) {
      output!.close()
      return stream
    }

    // History exists only on the open connection. A new connection has no history to replay.
    const open = this.open
    const replay = options.from ? open && historyFrom(open, options.from) : []
    if (!replay) {
      output!.error(new Error('Audio history is unavailable'))
      void scope.close()
      return stream
    }

    const connection = open ?? this.connect()
    const subscriber: Subscriber = { scope, output: output! }
    replay.forEach(block => subscriber.output.enqueue(block))
    connection.subscribers.add(subscriber)
    scope.defer(() => {
      connection.subscribers.delete(subscriber)
      try {
        subscriber.output.close()
      }
      catch {
        // The consumer already cancelled or the source already errored this stream.
      }
      if (!connection.subscribers.size)
        void connection.scope.close('No audio subscribers')
    })
    return stream
  }

  /** Keeps history for a holder, such as a detector whose result can start a capture before its window. */
  retain(signal: AbortSignal): HistoryLease {
    const lease: Lease = { from: this.position }
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
    const connection = this.connection
    connection?.subscribers.forEach(subscriber => void subscriber.scope.close('Audio input closed'))
    return connection?.scope.closed ?? Promise.resolve()
  }

  /** A closing connection keeps its object until cleanup runs, but it accepts no new subscriber. */
  private get open(): Connection | undefined {
    return this.connection && !this.connection.scope.signal.aborted ? this.connection : undefined
  }

  private connect(): Connection {
    const connection: Connection = { scope: createScope(), subscribers: new Set(), history: [], position: undefined, sampleRate: undefined }
    this.connection = connection
    connection.scope.defer(() => {
      // A quick resubscribe can replace this connection before its cleanup runs.
      if (this.connection === connection)
        this.connection = undefined
    })
    void this.read(connection)
    return connection
  }

  /** Triggering workflow: first subscriber → source.open → accepted blocks → subscribers and history. */
  private async read(connection: Connection) {
    const { scope } = connection
    let reader: ReadableStreamDefaultReader<PcmBlock> | undefined
    try {
      reader = this.source.open(scope.signal).getReader()
      scope.defer(() => reader?.cancel(scope.signal.reason).catch(() => {}))
      while (!scope.signal.aborted) {
        const { done, value: block } = await reader.read()
        if (done || scope.signal.aborted)
          break

        this.accept(connection, block)
      }
      if (!scope.signal.aborted) {
        for (const subscriber of connection.subscribers)
          void subscriber.scope.close('Audio source ended')
      }
    }
    catch (cause) {
      const error = cause instanceof Error ? cause : new Error('Audio source failed', { cause })
      if (!scope.signal.aborted) {
        for (const subscriber of connection.subscribers) {
          subscriber.output.error(error)
          void subscriber.scope.close(error)
        }
      }
    }
    finally {
      void scope.close()
    }
  }

  private accept(connection: Connection, block: PcmBlock) {
    const { position } = connection
    if (!position && block.range.sourceId === this.previousSourceId)
      throw new Error('Audio source reused the id of its previous connection')
    if (position && block.range.sourceId !== position.sourceId)
      throw new Error('Audio source changed its id within a connection')
    if (!isValidBlock(block, position?.frame))
      throw new Error('Invalid source audio block')
    if (position && connection.sampleRate !== block.sampleRate)
      throw new Error('Audio format changed within a source connection')
    // A gap inside one connection keeps its coordinates but drops history, because replay must be continuous.
    if (position && block.range.startFrame !== position.frame)
      connection.history.length = 0

    // A lease from an older connection, or one taken before any connection, holds this connection from its start.
    if (!position) {
      this.previousSourceId = block.range.sourceId
      for (const lease of this.leases)
        lease.from = { sourceId: block.range.sourceId, frame: block.range.startFrame }
    }

    connection.position = { sourceId: block.range.sourceId, frame: block.range.endFrame }
    connection.sampleRate = block.sampleRate
    connection.history.push(block)
    for (const subscriber of connection.subscribers) {
      if ((subscriber.output.desiredSize ?? 0) < 0) {
        subscriber.output.error(new Error('Audio subscriber fell behind'))
        void subscriber.scope.close('Audio subscriber fell behind')
        continue
      }
      subscriber.output.enqueue(block)
    }
    this.trimHistory(connection, block.sampleRate)
  }

  private trimHistory(connection: Connection, sampleRate: number) {
    const { history, position } = connection
    let retainedFrom = position!.frame - Math.floor((this.options.historyMs ?? 0) * sampleRate / 1000)
    for (const lease of this.leases) {
      if (lease.from?.sourceId === position!.sourceId)
        retainedFrom = Math.min(retainedFrom, lease.from.frame)
    }
    while (history.length && history[0].range.endFrame <= retainedFrom)
      history.shift()
    if (history.length && history[0].range.startFrame < retainedFrom)
      history[0] = sliceBlock(history[0], retainedFrom)
  }
}
