import type { TraceProfileDefinition } from './define'
import type { TraceAttributes, TraceIds, TraceLink, TraceRecord, TraceRecordInput, TraceStatus } from './types'

import { definitionRecordsOf } from './define'
import { TRACE_FORMAT } from './types'

/**
 * Where producers write trace records.
 *
 * A sink is a dependency at an external boundary, because records leave the module. A module without a sink uses
 * {@link noopTraceSink} and pays only one call.
 */
export interface TraceSink {
  emit: (record: TraceRecordInput) => void
  /**
   * Tells whether a track path has a reader or an active capture preset.
   * A producer skips a costly series, such as a VAD probability, while it returns false.
   */
  wants: (track: string) => boolean
  /** The value of the source clock now. A producer uses it for `ts` and for backdated records. */
  now: () => number
}

export const noopTraceSink: TraceSink = {
  emit: () => {},
  wants: () => false,
  now: () => performance.now(),
}

/**
 * Sends each record to several sinks. The error of one sink goes to `onError` and does not stop the others.
 * `wants` is true when any sink wants the track. `now` comes from the first sink.
 */
export function fanOutTraceSink(sinks: TraceSink[], onError: (error: unknown) => void): TraceSink {
  return {
    emit: (record) => {
      for (const sink of sinks) {
        try {
          sink.emit(record)
        }
        catch (error) {
          onError(error)
        }
      }
    },
    wants: track => sinks.some(sink => sink.wants(track)),
    now: () => (sinks[0] ?? noopTraceSink).now(),
  }
}

export interface TraceSourceOptions {
  /** Stable ID of the producer, for example `window:main`. */
  source: string
  /** The monotonic clock of the source, for example `mono:window:main`. */
  clock: string
  /** For example `electron-renderer` or `browser`. */
  runtime: string
  profiles?: TraceProfileDefinition[]
  /** Attributes of `source.started`, for example the route of a window. */
  attrs?: TraceAttributes
  /** Receives each stamped record. The transport to the collector. */
  send: (record: TraceRecord) => void
  /** @default performance.now */
  now?: () => number
  /** @default crypto.randomUUID */
  createEpoch?: () => string
}

/**
 * One run of a producer: it stamps `source`, `epoch`, `seq`, and the default clock on each record.
 *
 * Lifecycle: the constructor writes `source.started` and the definitions of its profiles. `stop` writes
 * `source.stopped` and ignores later records. A reload creates a new instance, which is a new epoch.
 *
 * `wants` reads the track set that {@link TraceSource.setWanted} received from the collector. Until the collector
 * answers, no costly series is wanted.
 */
export class TraceSource implements TraceSink {
  readonly source: string
  readonly epoch: string
  readonly clock: string
  private seq = 0
  private stopped = false
  private wanted: ReadonlySet<string> = new Set()
  private wantsAll = false
  private readonly sendRecord: (record: TraceRecord) => void
  readonly now: () => number

  constructor(options: TraceSourceOptions) {
    this.source = options.source
    this.clock = options.clock
    this.epoch = (options.createEpoch ?? (() => crypto.randomUUID()))()
    this.sendRecord = options.send
    this.now = options.now ?? (() => performance.now())

    const ts = this.now()
    const profiles = options.profiles ?? []
    this.emit({
      type: 'source.started',
      ts,
      format: TRACE_FORMAT,
      runtime: options.runtime,
      profiles: profiles.map(profile => ({ key: profile.key, version: profile.version })),
      ...(options.attrs ? { attrs: options.attrs } : {}),
    })
    for (const profile of profiles)
      this.announce(profile)
  }

  /** Announces the definitions of a profile, for example a plugin profile that loads later. */
  announce(profile: TraceProfileDefinition): void {
    for (const record of definitionRecordsOf(profile, this.now()))
      this.emit(record)
  }

  emit = (input: TraceRecordInput): void => {
    if (this.stopped)
      return
    this.sendRecord({ ...input, clock: input.clock ?? this.clock, source: this.source, epoch: this.epoch, seq: this.seq++ } as TraceRecord)
  }

  wants = (track: string): boolean => {
    return this.wantsAll || this.wanted.has(track)
  }

  /** Sets the track paths that readers show. `'*'` wants every track. */
  setWanted(tracks: Iterable<string> | '*'): void {
    this.wantsAll = tracks === '*'
    this.wanted = tracks === '*' ? new Set() : new Set(tracks)
  }

  stop(): void {
    if (this.stopped)
      return
    this.emit({ type: 'source.stopped', ts: this.now() })
    this.stopped = true
  }
}

/** A random 16 hex digit span ID, the size of a W3C trace context span ID. */
export function createSpanId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

export interface BeginSpanOptions {
  track: string
  name: string
  ids?: TraceIds
  attrs?: TraceAttributes
  links?: TraceLink[]
  /** The span ID of the enclosing span. Real nesting only. */
  parent?: string | TraceSpan
  deadlineMs?: number
  /** A backdated start, on the source clock. @default sink.now() */
  ts?: number
  /** A known span ID, for example one that another record already links to. @default createSpanId() */
  spanId?: string
}

export interface EndSpanOptions {
  status?: TraceStatus
  reason?: string
  message?: string
  attrs?: TraceAttributes
  links?: TraceLink[]
  /** A backdated end, on the source clock. */
  ts?: number
}

/**
 * An open span of one producer. It writes `span.begin` at once, so readers see open work.
 *
 * Lifecycle: `end` writes `span.end` once. Later calls of `update`, `instant`, and `end` do nothing, so a cleanup
 * path can end a span that a success path already ended.
 */
export class TraceSpan {
  readonly spanId: string
  readonly track: string
  readonly ids: TraceIds | undefined
  private ended = false

  constructor(private readonly sink: TraceSink, options: BeginSpanOptions) {
    this.spanId = options.spanId ?? createSpanId()
    this.track = options.track
    this.ids = options.ids
    const parentSpanId = typeof options.parent === 'string' ? options.parent : options.parent?.spanId
    sink.emit({
      type: 'span.begin',
      ts: options.ts ?? sink.now(),
      track: options.track,
      spanId: this.spanId,
      name: options.name,
      ...(parentSpanId ? { parentSpanId } : {}),
      ...(options.ids ? { ids: options.ids } : {}),
      ...(options.attrs ? { attrs: options.attrs } : {}),
      ...(options.links ? { links: options.links } : {}),
      ...(options.deadlineMs !== undefined ? { deadlineMs: options.deadlineMs } : {}),
    })
  }

  get isEnded(): boolean {
    return this.ended
  }

  update(attrs: TraceAttributes): void {
    if (this.ended)
      return
    this.sink.emit({ type: 'span.update', ts: this.sink.now(), track: this.track, spanId: this.spanId, attrs, ...this.idFields() })
  }

  instant(name: string, attrs?: TraceAttributes, ts?: number): void {
    if (this.ended)
      return
    this.sink.emit({ type: 'instant', ts: ts ?? this.sink.now(), track: this.track, spanId: this.spanId, name, ...(attrs ? { attrs } : {}), ...this.idFields() })
  }

  end(options: EndSpanOptions = {}): void {
    if (this.ended)
      return
    this.ended = true
    this.sink.emit({
      type: 'span.end',
      ts: options.ts ?? this.sink.now(),
      track: this.track,
      spanId: this.spanId,
      status: options.status ?? 'ok',
      ...(options.reason ? { reason: options.reason } : {}),
      ...(options.message ? { message: options.message } : {}),
      ...(options.attrs ? { attrs: options.attrs } : {}),
      ...(options.links ? { links: options.links } : {}),
      ...this.idFields(),
    })
  }

  private idFields(): { ids?: TraceIds } {
    return this.ids ? { ids: this.ids } : {}
  }
}

/** Writes `span.begin` on `sink` and returns the open span. */
export function beginSpan(sink: TraceSink, options: BeginSpanOptions): TraceSpan {
  return new TraceSpan(sink, options)
}

export interface SeriesWriterOptions {
  track: string
  ids?: TraceIds
  /** A chunk holds the samples of about this long. @default 1000 */
  chunkMs?: number
}

/**
 * Writes a frequent series, such as an audio level or a VAD probability, as `sample.chunk` records.
 *
 * Samples wait in memory until the chunk reaches `chunkMs`, then go out as one record with offsets from its first
 * sample. While the sink does not want the track, `push` drops the sample, so a series that no one reads costs nothing.
 * Call `flush` when the series pauses, for example when an input ends, so its last samples show at once.
 */
export class SeriesWriter {
  private readonly chunkMs: number
  private start: number | undefined
  private readonly offsets: number[] = []
  private readonly values = new Map<string, number[]>()

  constructor(private readonly sink: () => TraceSink, private readonly options: SeriesWriterOptions) {
    this.chunkMs = options.chunkMs ?? 1000
  }

  /** Whether a reader wants the track now. A producer can skip costly work, such as decoding, while it is false. */
  wanted(): boolean {
    return this.sink().wants(this.options.track)
  }

  push(values: Record<string, number>, ts?: number): void {
    const sink = this.sink()
    if (!sink.wants(this.options.track)) {
      this.offsets.length = 0
      this.values.clear()
      this.start = undefined
      return
    }
    const time = ts ?? sink.now()
    const keys = Object.keys(values)
    // Every column of a chunk has one value for each offset. A change of keys starts a new chunk, because a placeholder
    // such as NaN would not survive JSON.
    const sameKeys = keys.length === this.values.size && keys.every(key => this.values.has(key))
    if (this.start !== undefined && (time - this.start >= this.chunkMs || !sameKeys))
      this.flush()
    this.start ??= time
    this.offsets.push(time - this.start)
    for (const key of keys) {
      let column = this.values.get(key)
      if (!column) {
        column = []
        this.values.set(key, column)
      }
      column.push(values[key]!)
    }
  }

  flush(): void {
    if (this.start === undefined || this.offsets.length === 0)
      return
    this.sink().emit({
      type: 'sample.chunk',
      ts: this.start,
      track: this.options.track,
      ...(this.options.ids ? { ids: this.options.ids } : {}),
      offsetsMs: [...this.offsets],
      values: Object.fromEntries([...this.values].map(([key, column]) => [key, [...column]])),
    })
    this.offsets.length = 0
    this.values.clear()
    this.start = undefined
  }
}
