import type { TraceTrackDefinition } from '../core/define'
import type { TraceAnnotation, TraceAttributes, TraceIds, TraceLink, TraceRecord, TraceStatus } from '../core/types'
import type { TraceApplyContext, TraceProjection } from './reader'

import { matchTrackPath } from '../core/define'
import { recordKey, spanKeyOf } from '../core/types'
import { linkTargetKey } from './reader'

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
  /** Updates without their begin, by span key. They wait for the begin within the reader window. */
  pendingUpdates: Map<string, TraceAttributes>
}

function emptyState(): TimelineState {
  return {
    tracks: new Map(),
    spans: new Map(),
    definitions: new Map(),
    trackDefinitions: [],
    markers: [],
    gaps: [],
    sources: new Map(),
    annotations: [],
    start: Number.POSITIVE_INFINITY,
    end: Number.NEGATIVE_INFINITY,
    counters: { records: 0, late: 0, orphanUpdates: 0, reordered: 0 },
    pendingUpdates: new Map(),
  }
}

function trackOf(state: TimelineState, path: string): TimelineTrack {
  let track = state.tracks.get(path)
  if (!track) {
    let definition: TraceTrackDefinition | undefined
    let params: Record<string, string> = {}
    for (const candidate of state.trackDefinitions) {
      const match = matchTrackPath(candidate.path, path)
      if (match) {
        definition = candidate
        params = match
        break
      }
    }
    track = { path, definition, params, spans: [], instants: [], states: [], series: {}, lanes: [], hasError: false }
    state.tracks.set(path, track)
  }
  return track
}

/** A new or changed track definition matches existing tracks again. */
function rematchTracks(state: TimelineState): void {
  for (const track of state.tracks.values()) {
    track.definition = undefined
    track.params = {}
    for (const candidate of state.trackDefinitions) {
      const match = matchTrackPath(candidate.path, track.path)
      if (match) {
        track.definition = candidate
        track.params = match
        break
      }
    }
  }
}

/**
 * Moves an effect after its cause in the view when clock conversion put it earlier.
 * Only `caused-by` links to a known record or span count.
 */
function repairCausality(time: number, links: TraceLink[] | undefined, state: TimelineState, context: TraceApplyContext): { time: number, reordered: boolean } {
  let repaired = time
  for (const link of links ?? []) {
    if (link.rel !== 'caused-by')
      continue
    let causeTime: number | undefined
    if ('spanId' in link.to) {
      const begin = context.indexes.bySpanId.get(link.to.spanId)
      causeTime = begin ? state.spans.get(spanKeyOf(begin.source, begin.epoch, link.to.spanId))?.start : undefined
    }
    else if ('seq' in link.to) {
      const cause = context.indexes.byKey.get(link.to)
      if (cause)
        causeTime = findRecordTime(state, cause)
    }
    if (causeTime !== undefined && causeTime > repaired)
      repaired = causeTime
  }
  return { time: repaired, reordered: repaired !== time }
}

function findRecordTime(state: TimelineState, record: TraceRecord): number | undefined {
  const key = recordKey(record)
  if ('spanId' in record && record.spanId && (record.type === 'span.begin' || record.type === 'span.complete'))
    return state.spans.get(spanKeyOf(record.source, record.epoch, record.spanId))?.start
  if (!('track' in record))
    return undefined
  const track = state.tracks.get(record.track)
  return track?.instants.find(instant => instant.key === key)?.time
    ?? track?.states.find(change => change.key === key)?.time
}

/** Assigns the sub-lane of a new span: the first lane at its depth that is free at its start. */
function assignLane(track: TimelineTrack, depth: number, start: number): number {
  const busyUntil = track.lanes[depth] ??= []
  let lane = busyUntil.findIndex(end => end <= start)
  if (lane === -1)
    lane = busyUntil.length
  busyUntil[lane] = Number.POSITIVE_INFINITY
  return lane
}

/** Frees the lane of a span that ended or was abandoned. */
function releaseLane(state: TimelineState, span: TimelineSpan, end: number): void {
  const busyUntil = state.tracks.get(span.track)?.lanes[span.depth]
  if (busyUntil && busyUntil[span.lane] === Number.POSITIVE_INFINITY)
    busyUntil[span.lane] = end
}

function abandonEpoch(state: TimelineState, source: string, epoch: string): void {
  for (const span of state.spans.values()) {
    if (span.source === source && span.epoch === epoch && span.end === undefined && !span.abandoned) {
      span.abandoned = true
      releaseLane(state, span, state.end)
    }
  }
}

function extend(state: TimelineState, time: number): void {
  if (time < state.start)
    state.start = time
  if (time > state.end)
    state.end = time
}

/**
 * The empty list and the empty attributes that spans share. Most spans have no instants, annotations, or links, so
 * one frozen value saves an array or an object on each span. The helpers below never change them in place.
 */
const NO_ITEMS: readonly never[] = Object.freeze([])
const NO_ATTRS: TraceAttributes = Object.freeze({})

/** A list with the items added. It copies the list, so a shared or published list never changes. */
function appendTo<T>(list: readonly T[], items: readonly T[] | undefined): readonly T[] {
  if (!items || items.length === 0)
    return list
  return list.length === 0 ? [...items] : [...list, ...items]
}

/**
 * Attributes with an update merged in. Without an update the attributes stay, and attributes without a merge are the
 * record's own object. Records do not change, so the span can share it.
 */
function mergeAttrs(attrs: TraceAttributes, update: TraceAttributes | undefined): TraceAttributes {
  if (!update)
    return attrs
  return attrs === NO_ATTRS ? update : { ...attrs, ...update }
}

function annotate(span: TimelineSpan | undefined, annotation: TraceAnnotation): void {
  if (span)
    span.annotations = appendTo(span.annotations, [annotation])
}

function beginSpan(state: TimelineState, record: Extract<TraceRecord, { type: 'span.begin' | 'span.complete' }>, context: TraceApplyContext): TimelineSpan {
  const key = spanKeyOf(record.source, record.epoch, record.spanId)
  const existing = state.spans.get(key)
  if (existing) {
    // A pinned copy and the buffered begin of one open span. Keep the first, merge the attributes.
    existing.attrs = mergeAttrs(existing.attrs, record.attrs)
    if (existing.startMissing) {
      existing.start = context.time
      existing.startMissing = false
    }
    return existing
  }

  const track = trackOf(state, record.track)
  const parentKey = record.parentSpanId ? spanKeyOf(record.source, record.epoch, record.parentSpanId) : undefined
  const parent = parentKey ? state.spans.get(parentKey) : undefined
  const depth = parent && parent.track === record.track ? parent.depth + 1 : 0
  const { time, reordered } = repairCausality(context.time, record.links, state, context)
  const pending = state.pendingUpdates.get(key)
  state.pendingUpdates.delete(key)

  const span: TimelineSpan = {
    key,
    spanId: record.spanId,
    source: record.source,
    epoch: record.epoch,
    track: record.track,
    name: record.name,
    parentKey,
    depth,
    lane: assignLane(track, depth, time),
    ids: record.ids,
    attrs: mergeAttrs(record.attrs ?? NO_ATTRS, pending),
    links: record.links ?? NO_ITEMS,
    start: time,
    deadlineMs: record.type === 'span.begin' ? record.deadlineMs : undefined,
    estimated: context.estimated || undefined,
    reordered: reordered || undefined,
    late: context.late || undefined,
    instants: NO_ITEMS,
    annotations: NO_ITEMS,
  }
  if (reordered)
    state.counters.reordered++
  state.spans.set(key, span)
  track.spans.push(span)
  extend(state, time)
  return span
}

function handleRecord(state: TimelineState, record: TraceRecord, context: TraceApplyContext): TimelineState {
  state.counters.records++
  if (context.late)
    state.counters.late++

  const source = state.sources.get(record.source)
  if (source && source.epoch === record.epoch)
    source.newestTime = Math.max(source.newestTime, context.time)

  switch (record.type) {
    case 'source.started': {
      const previous = state.sources.get(record.source)
      if (previous && previous.epoch !== record.epoch)
        abandonEpoch(state, previous.source, previous.epoch)
      state.sources.set(record.source, { source: record.source, epoch: record.epoch, runtime: record.runtime, live: true, newestTime: context.time })
      break
    }
    case 'source.stopped': {
      abandonEpoch(state, record.source, record.epoch)
      const current = state.sources.get(record.source)
      if (current?.epoch === record.epoch)
        current.live = false
      break
    }
    case 'source.lost': {
      abandonEpoch(state, record.of.source, record.of.epoch)
      const current = state.sources.get(record.of.source)
      if (current?.epoch === record.of.epoch)
        current.live = false
      state.markers.push({ kind: 'source-lost', time: context.time, label: `${record.of.source}: ${record.reason}` })
      // Each source owns its state tracks. A lost source leaves them unknown.
      for (const track of state.tracks.values()) {
        if (track.stateOwner === record.of.source && track.states.at(-1)?.value !== 'unknown')
          track.states.push({ key: recordKey(record), track: track.path, time: context.time, value: 'unknown', source: record.of.source })
      }
      break
    }
    case 'clock.discontinuity': {
      state.markers.push({ kind: 'clock-discontinuity', time: context.time, label: `${record.of}: ${record.reason}` })
      break
    }
    case 'clock.snapshot': {
      // A snapshot after a discontinuity of one of its clocks closes the shaded band.
      for (const marker of state.markers) {
        if (marker.kind === 'clock-discontinuity' && marker.until === undefined && record.values.some(value => marker.label.startsWith(`${value.clock}:`)))
          marker.until = context.time
      }
      break
    }
    case 'definition': {
      state.definitions.set(`${record.kind}/${record.key}`, record.data)
      if (record.kind === 'track') {
        const definition = record.data as TraceTrackDefinition
        state.trackDefinitions = [...state.trackDefinitions.filter(candidate => candidate.path !== definition.path), definition]
        rematchTracks(state)
      }
      break
    }
    case 'span.begin':
    case 'span.complete': {
      const span = beginSpan(state, record, context)
      if (record.type === 'span.complete') {
        span.end = span.start + record.durationMs
        releaseLane(state, span, span.end)
        span.status = record.status
        span.reason = record.reason
        extend(state, span.end)
        if (record.status === 'error')
          trackOf(state, record.track).hasError = true
      }
      break
    }
    case 'span.update': {
      const key = spanKeyOf(record.source, record.epoch, record.spanId)
      const span = state.spans.get(key)
      if (span) {
        span.attrs = mergeAttrs(span.attrs, record.attrs)
        span.links = appendTo(span.links, record.links)
      }
      else {
        state.counters.orphanUpdates++
        state.pendingUpdates.set(key, { ...state.pendingUpdates.get(key), ...record.attrs })
      }
      break
    }
    case 'span.end': {
      const key = spanKeyOf(record.source, record.epoch, record.spanId)
      let span = state.spans.get(key)
      if (!span) {
        // An end without its begin starts at the left edge of the window, with a "start missing" marker.
        const name = typeof record.attrs?.name === 'string' ? record.attrs.name : record.spanId
        span = beginSpan(state, { ...record, type: 'span.begin', name }, { ...context, time: Number.isFinite(state.start) ? state.start : context.time })
        span.startMissing = true
      }
      if (span.end !== undefined)
        break
      span.end = Math.max(context.time, span.start)
      span.status = record.status
      span.reason = record.reason
      span.message = record.message
      span.abandoned = undefined
      releaseLane(state, span, span.end)
      span.attrs = mergeAttrs(span.attrs, record.attrs)
      span.links = appendTo(span.links, record.links)
      if (record.status === 'error')
        trackOf(state, record.track).hasError = true
      extend(state, span.end)
      break
    }
    case 'instant':
    case 'log': {
      const track = trackOf(state, record.track)
      const { time, reordered } = repairCausality(context.time, record.links, state, context)
      const instant: TimelineInstant = {
        key: recordKey(record),
        name: record.type === 'log' ? record.message : record.name,
        track: record.track,
        time,
        ids: record.ids,
        attrs: record.attrs,
        links: record.links,
        reordered: reordered || undefined,
        estimated: context.estimated || undefined,
        late: context.late || undefined,
        level: record.type === 'log' ? record.level : undefined,
      }
      if (reordered)
        state.counters.reordered++
      if (record.type === 'instant' && record.spanId) {
        instant.spanKey = spanKeyOf(record.source, record.epoch, record.spanId)
        const span = state.spans.get(instant.spanKey)
        if (span)
          span.instants = appendTo(span.instants, [instant])
      }
      if (!track.instants.some(existing => existing.key === instant.key))
        track.instants.push(instant)
      extend(state, time)
      break
    }
    case 'state': {
      const track = trackOf(state, record.track)
      const owner = track.definition?.stateOwner ?? 'single'
      track.stateOwner ??= record.source
      const { time, reordered } = repairCausality(context.time, record.links, state, context)
      const change: TimelineStateChange = {
        key: recordKey(record),
        track: record.track,
        time,
        value: record.value,
        from: record.from,
        rule: typeof record.attrs?.rule === 'string' ? record.attrs.rule : undefined,
        links: record.links,
        source: record.source,
        foreignOwner: owner === 'single' && track.stateOwner !== record.source ? true : undefined,
      }
      if (reordered)
        state.counters.reordered++
      // A backdated state goes into the history at its time, so the list stays sorted by time.
      let index = track.states.length
      while (index > 0 && track.states[index - 1]!.time > time)
        index--
      if (!track.states.some(existing => existing.key === change.key))
        track.states.splice(index, 0, change)
      extend(state, time)
      break
    }
    case 'sample':
    case 'sample.chunk': {
      const track = trackOf(state, record.track)
      const entries = record.type === 'sample'
        ? Object.entries(record.values).map(([key, value]) => [key, [value]] as const)
        : Object.entries(record.values)
      for (const [valueKey, values] of entries) {
        const series = track.series[valueKey] ??= { times: [], values: [] }
        for (const [index, value] of values.entries()) {
          const offset = record.type === 'sample.chunk' ? (record.offsetsMs?.[index] ?? index * (record.intervalMs ?? 0)) : 0
          series.times.push(context.time + offset)
          series.values.push(value)
        }
      }
      extend(state, context.time)
      break
    }
    case 'annotation': {
      if (record.target.spanId) {
        const begin = context.indexes.bySpanId.get(record.target.spanId)
        if (begin)
          annotate(state.spans.get(spanKeyOf(begin.source, begin.epoch, record.target.spanId)), record)
      }
      else if (record.target.ref) {
        const target = context.indexes.byKey.get(record.target.ref)
        if (target && 'spanId' in target && target.spanId)
          annotate(state.spans.get(spanKeyOf(target.source, target.epoch, target.spanId)), record)
      }
      else {
        state.annotations.push(record)
      }
      break
    }
  }

  return state
}

/**
 * The timeline: tracks with spans, instants, state changes, and series, plus global markers and gaps.
 *
 * Display times are converted times. A span keeps the sub-lane that it got at begin, so lanes do not jump while the
 * view is live.
 */
export function createTimelineProjection(): TraceProjection<TimelineState> {
  return {
    key: 'timeline',
    reset: emptyState,
    handleRecord,
    handleSeries: (state, series) => {
      const track = trackOf(state, series.track)
      const target = track.series[series.key] ??= { times: [], values: [] }
      target.times.push(...series.times)
      target.values.push(...series.values)
      if (series.times.length > 0)
        extend(state, series.times.at(-1)!)
      return state
    },
    evict: (state, range) => {
      state.gaps.push(range)
      return state
    },
    select: state => state,
  }
}

/**
 * The start of the provisional region: the earliest watermark of the live sources.
 * A watermark trails the newest record of its source by the allowed lateness.
 */
export function provisionalFrom(state: TimelineState, allowedLatenessMs = 5000): number | undefined {
  let earliest: number | undefined
  for (const source of state.sources.values()) {
    if (!source.live || source.source === 'collector')
      continue
    const watermark = source.newestTime - allowedLatenessMs
    earliest = earliest === undefined ? watermark : Math.min(earliest, watermark)
  }
  return earliest
}

/** Records that link to a span, and the targets that the span links to. */
export function linksOfSpan(span: TimelineSpan, indexes: TraceApplyContext['indexes']): { incoming: TraceRecord[], outgoing: readonly TraceLink[] } {
  return {
    incoming: indexes.linksTo.get(linkTargetKey({ spanId: span.spanId })) ?? [],
    outgoing: span.links,
  }
}
