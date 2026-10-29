import type { TraceAggregate, TraceMetricDefinition, TraceTrackDefinition } from '../core/definitions'
import type { TraceFeedMessage } from '../core/feed'
import type { TraceAnnotation, TraceAttributes, TraceIds, TraceLink, TraceRecord, TraceStatus } from '../core/types'
import type { RecordIndex } from './reader'

/** Indexes that every projection of one reader shares. The reader fills them before the projections run. */
export interface TraceIndexes {
  /** Records by source, epoch, and seq. */
  byKey: RecordIndex
  /** The `span.begin` or `span.complete` record of each span ID. */
  bySpanId: Map<string, TraceRecord>
  /** Records that link to a target, by target key: a record key, `span:<id>`, or `id:<key>=<value>`. */
  linksTo: Map<string, TraceRecord[]>
  /** Records by `<id key>=<value>`. */
  byId: Map<string, TraceRecord[]>
}

export interface TraceApplyContext {
  /** The record came from the pinned set. */
  pinned: boolean
  /** The record arrived after the watermark of its source. */
  late: boolean
  /** The event time on the trace clock. Without a clock path, the observed time. */
  time: number
  /** The time is estimated: a clock on the path has no measured latency, or no clock path exists. */
  estimated: boolean
  indexes: TraceIndexes
}

/**
 * Turns records into view state.
 *
 * `handleRecord` is pure: no I/O, no clock, and no Vue refs. It tolerates orphans and duplicates. The state is plain
 * objects and typed arrays, and `handleRecord` can mutate it in place for speed. A reader owns the state.
 */
export interface TraceProjection<State, View = State> {
  /** A stable key, for example `timeline`, `event-log`, or `voice.floor-transfer`. */
  key: string
  reset: () => State
  handleRecord: (state: State, record: TraceRecord, context: TraceApplyContext) => State
  /** Points of a series from the collector backlog, on the trace clock. */
  handleSeries?: (state: State, series: Extract<TraceFeedMessage, { kind: 'series' }>) => State
  /** The collector evicted records in this range of the trace clock. */
  evict?: (state: State, range: { from: number, to: number }) => State
  finalize?: (state: State) => State
  select: (state: State) => View
}

/**
 * A projection whose state the reader treats as opaque, so one reader holds projections of different states.
 *
 * The state parameters are `never`: under `strictFunctionTypes`, a function of any state can stand in for them. The
 * reader only passes a state back to the projection that created it.
 */
export interface AnyTraceProjection {
  key: string
  reset: () => unknown
  handleRecord: (state: never, record: TraceRecord, context: TraceApplyContext) => unknown
  handleSeries?: (state: never, series: Extract<TraceFeedMessage, { kind: 'series' }>) => unknown
  evict?: (state: never, range: { from: number, to: number }) => unknown
  finalize?: (state: never) => unknown
  select: (state: never) => unknown
}

export interface TimelineInstant {
  /** `source/epoch/seq` of the record. */
  key: string
  name: string
  track: string
  time: number
  spanKey?: string
  ids?: TraceIds
  attrs?: TraceAttributes
  links?: TraceLink[]
  /** The time was moved after its cause in the view. The stored record keeps its value. */
  reordered?: boolean
  estimated?: boolean
  late?: boolean
  level?: 'debug' | 'info' | 'warn' | 'error'
}

export interface TimelineSpan {
  /** `source/epoch/spanId`. */
  key: string
  spanId: string
  source: string
  epoch: string
  track: string
  name: string
  parentKey?: string
  /** Nesting depth among spans of the same track. */
  depth: number
  /** Sub-lane at this depth. Assigned once, at begin. */
  lane: number
  ids?: TraceIds
  /** Merged attributes of begin, updates, and end. Spans without attributes share one frozen empty object. */
  attrs: TraceAttributes
  /** Spans without links share one frozen empty list. The projection replaces a list when it adds to it. */
  links: readonly TraceLink[]
  start: number
  end?: number
  status?: TraceStatus
  reason?: string
  message?: string
  deadlineMs?: number
  /** The source of the span stopped, was lost, or started a new epoch before the span ended. */
  abandoned?: boolean
  /** The begin is missing. The span starts at the left edge of the reader window. */
  startMissing?: boolean
  estimated?: boolean
  reordered?: boolean
  late?: boolean
  instants: readonly TimelineInstant[]
  annotations: readonly TraceAnnotation[]
}

export interface TimelineStateChange {
  key: string
  track: string
  time: number
  value: string
  from?: string
  /** The `rule` attribute: the rule that decided the change. */
  rule?: string
  links?: TraceLink[]
  source: string
  /** A record from a source that does not own the state of the track. */
  foreignOwner?: boolean
}

export interface TimelineTrack {
  path: string
  /** The track definition whose path pattern matches, if any. */
  definition?: TraceTrackDefinition
  /** The `{key}` values of the matched pattern. */
  params: Record<string, string>
  spans: TimelineSpan[]
  instants: TimelineInstant[]
  states: TimelineStateChange[]
  /** Series points by value key, on the trace clock, in arrival order. */
  series: Record<string, { times: number[], values: number[] }>
  /** The busy end of each sub-lane at each depth. An open span keeps its lane busy until `Infinity`. */
  lanes: number[][]
  /** A span of the track ended with an error. The viewer keeps the track visible. */
  hasError: boolean
  /** The source that owns the state of the track: the first source that wrote a state. */
  stateOwner?: string
}

/** A global marker: a lost source or a clock discontinuity. */
export interface TimelineMarker {
  kind: 'source-lost' | 'clock-discontinuity'
  time: number
  label: string
  /** The end of a shaded band. A discontinuity without a later snapshot has none. */
  until?: number
}

export interface TimelineSource {
  source: string
  epoch: string
  runtime?: string
  live: boolean
  /** The newest event time. The watermark of the source trails it by the allowed lateness. */
  newestTime: number
}

export interface TimelineState {
  tracks: Map<string, TimelineTrack>
  spans: Map<string, TimelineSpan>
  definitions: Map<string, unknown>
  trackDefinitions: TraceTrackDefinition[]
  markers: TimelineMarker[]
  gaps: { from: number, to: number }[]
  sources: Map<string, TimelineSource>
  /** Annotations whose target is a set of IDs, such as a conversation or a topic. */
  annotations: TraceAnnotation[]
  start: number
  end: number
  counters: { records: number, late: number, orphanUpdates: number, reordered: number }
  /**
   * Updates without their begin, by span key, with the time of the newest update. They wait for the begin for the
   * allowed lateness, then they go. `counters.orphanUpdates` counts them.
   */
  pendingUpdates: Map<string, { attrs: TraceAttributes, time: number }>
}

export interface EventLogEntry {
  key: string
  time: number
  record: TraceRecord
  late?: boolean
  pinned?: boolean
  estimated?: boolean
}

export interface EventLogState {
  entries: EventLogEntry[]
  /** Keys of the entries, so a pinned copy and its buffered copy show once. */
  keys: Set<string>
  /** Entries that the limit dropped. */
  dropped: number
}

/** One measurement. Censored, warm-up, and failed measurements are counted, but percentiles leave them out. */
export interface MetricSample {
  time: number
  value: number
  /** Dimension values, for example `{ from: 'user', to: 'airi' }`. */
  dimensions?: Record<string, string>
  excluded?: 'censored' | 'warmup' | 'failed'
}

/** The samples of each metric key. A derived projection selects this shape too. */
export type MetricSamples = Record<string, MetricSample[]>

export interface MetricSummary {
  key: string
  definition?: TraceMetricDefinition
  values: Partial<Record<TraceAggregate, number>>
  count: number
  excluded: { censored: number, warmup: number, failed: number }
  /** The summary of each dimension combination, keyed by `value|value`. */
  byDimension?: Record<string, Partial<Record<TraceAggregate, number>>>
}
