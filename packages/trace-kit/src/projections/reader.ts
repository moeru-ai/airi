import type { TraceFeedMessage } from '../core/feed'
import type { TraceRecord, TraceRef } from '../core/types'
import type { AnyTraceProjection, TraceApplyContext, TraceIndexes, TraceProjection } from './types'

import { ClockGraph } from '../core/clock'
import { recordKey, streamClockOf } from '../core/keys'

/**
 * Records by source, epoch, and seq.
 *
 * A map from `source/epoch` to a map from `seq` keeps one number per record. A map with `source/epoch/seq` strings as
 * keys keeps one string per record, and costs about five times the memory for the same lookups.
 */
export class RecordIndex {
  private readonly epochs = new Map<string, Map<number, TraceRecord>>()
  private count = 0

  get size(): number {
    return this.count
  }

  get(ref: TraceRef): TraceRecord | undefined {
    return this.epochs.get(`${ref.source}/${ref.epoch}`)?.get(ref.seq)
  }

  has(ref: TraceRef): boolean {
    return this.epochs.get(`${ref.source}/${ref.epoch}`)?.has(ref.seq) ?? false
  }

  /** Adds a record. A record with the same source, epoch, and seq stays, and the call returns false. */
  add(record: TraceRecord): boolean {
    const epochKey = `${record.source}/${record.epoch}`
    let records = this.epochs.get(epochKey)
    if (!records) {
      records = new Map()
      this.epochs.set(epochKey, records)
    }
    if (records.has(record.seq))
      return false
    records.set(record.seq, record)
    this.count++
    return true
  }

  clear(): void {
    this.epochs.clear()
    this.count = 0
  }
}

/** The index key of a link target. */
export function linkTargetKey(to: TraceRef | { spanId: string } | { key: string, id: string | number }): string {
  if ('spanId' in to)
    return `span:${to.spanId}`
  if ('key' in to)
    return `id:${to.key}=${to.id}`
  return recordKey(to)
}

function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key)
  if (list)
    list.push(value)
  else
    map.set(key, [value])
}

/**
 * Feeds collector messages to projections in apply order.
 *
 * Apply order is the arrival order of the feed. For one epoch, it is the `seq` order, as the transports deliver it.
 * Display order is the converted time, which each projection reads from the context.
 *
 * The reader keeps its own clock graph from the snapshot records in the feed, so a replay of a file converts times in
 * the same way as the live view. `version` changes on each handled message. A view reads through selectors keyed on it.
 */
export class TraceReader {
  readonly clocks: ClockGraph
  readonly indexes: TraceIndexes = { byKey: new RecordIndex(), bySpanId: new Map(), linksTo: new Map(), byId: new Map() }
  version = 0
  caughtUp = false
  private readonly states = new Map<string, unknown>()

  constructor(private readonly projections: AnyTraceProjection[], traceClock = 'mono:collector') {
    this.clocks = new ClockGraph(traceClock)
    for (const projection of projections)
      this.states.set(projection.key, projection.reset())
  }

  handle(message: TraceFeedMessage): void {
    this.version++
    switch (message.kind) {
      case 'record':
        this.apply(message.record, message.pinned ?? false, message.late ?? false)
        break
      case 'series':
        for (const projection of this.projections) {
          if (projection.handleSeries)
            this.states.set(projection.key, projection.handleSeries(this.stateOf(projection), message))
        }
        break
      case 'gap':
        for (const projection of this.projections) {
          if (projection.evict)
            this.states.set(projection.key, projection.evict(this.stateOf(projection), { from: message.from, to: message.to }))
        }
        break
      case 'caughtUp':
        this.caughtUp = true
        break
    }
  }

  /** Feeds records without a collector, for example the lines of a file or the records of a test. */
  handleRecords(records: Iterable<TraceRecord>): void {
    for (const record of records)
      this.handle({ kind: 'record', record })
    this.handle({ kind: 'caughtUp', cursor: {}, traceClock: this.clocks.traceClock })
  }

  /** The view of a projection of this reader. */
  view<State, View>(projection: TraceProjection<State, View>): View {
    if (!this.projections.includes(projection))
      throw new Error(`No projection ${projection.key} in this reader`)
    const state = this.states.get(projection.key) as State
    return projection.select(projection.finalize ? projection.finalize(state) : state)
  }

  /** The state of a projection, typed for the call. Each state was created by the same projection. */
  private stateOf(projection: AnyTraceProjection): never {
    return this.states.get(projection.key) as never
  }

  reset(): void {
    this.version++
    this.caughtUp = false
    this.indexes.byKey.clear()
    this.indexes.bySpanId.clear()
    this.indexes.linksTo.clear()
    this.indexes.byId.clear()
    this.clocks.clear()
    for (const projection of this.projections)
      this.states.set(projection.key, projection.reset())
  }

  /** The event time of a record on the trace clock. */
  timeOf(record: TraceRecord): { time: number, estimated: boolean } {
    const converted = this.clocks.convert(record.clock, record.ts)
    if (converted)
      return { time: converted.value, estimated: converted.estimated }
    return { time: record.observedTs ?? record.ts, estimated: true }
  }

  private apply(record: TraceRecord, pinned: boolean, late: boolean): void {
    // A pinned record can arrive again from the buffer. The first copy wins, so a metric counts it once and a clock
    // snapshot weighs once in the fit. The collector sends the pinned copy first, with its updates merged.
    if (!this.indexes.byKey.add(record))
      return

    if (record.type === 'clock.snapshot')
      this.clocks.addSnapshot(record.values, record.uncertaintyMs, record.attrs?.estimated === true)
    else if (record.type === 'clock.discontinuity')
      this.clocks.addDiscontinuity(record.of)
    else if (record.type === 'stream.started' && record.rate)
      this.clocks.setUnitsPerMs(streamClockOf(record.streamId), record.rate / 1000)
    if ((record.type === 'span.begin' || record.type === 'span.complete') && !this.indexes.bySpanId.has(record.spanId))
      this.indexes.bySpanId.set(record.spanId, record)
    if ('links' in record) {
      for (const link of record.links ?? [])
        pushTo(this.indexes.linksTo, linkTargetKey(link.to), record)
    }
    for (const [idKey, value] of Object.entries(record.ids ?? {}))
      pushTo(this.indexes.byId, `${idKey}=${value}`, record)

    const { time, estimated } = this.timeOf(record)
    const context: TraceApplyContext = { pinned, late, time, estimated, indexes: this.indexes }
    for (const projection of this.projections)
      this.states.set(projection.key, projection.handleRecord(this.stateOf(projection), record, context))
  }
}
