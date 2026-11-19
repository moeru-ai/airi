import type { Localizable, TraceAnnotator, TraceRecordType } from './types'

/** Label and hover text of a key. A key without them still works, and the viewer shows the raw key. */
export interface TraceText {
  label?: Localizable
  /** What the key means and how to read it. */
  description?: Localizable
}

export type TraceTrackRender = 'spans' | 'instants' | 'state' | 'series'

/**
 * How the spans of a track show on the lane of their entity.
 *
 * - `waiting`: the entity holds a turn or a request and waits, for example for a sub-agent. Drawn hatched, below the rest.
 * - `thinking`: work before output, such as a model request before its first chunk, recognition, or a judgement. Drawn light.
 * - `active`: output or an action, such as speech, generation, playback, or a tool call. Drawn solid, on top.
 */
export type TraceActivity = 'waiting' | 'thinking' | 'active'

export interface TraceTrackDefinition extends TraceText {
  /** A path pattern. `{key}` matches one segment, named by an ID key, for example `participants/{actor}/speech`. */
  path: string
  /** An open string. Profiles give their own groups. The viewer groups lanes by it. */
  group: string
  /** Lane order inside the group. Lower comes first. */
  order: number
  /** One track can combine kinds, for example `['spans', 'state']`. */
  render: TraceTrackRender[]
  color?: string
  icon?: string
  unit?: string
  /** The values of a state track, in legend order. */
  states?: string[]
  /**
   * `single`: one source writes the state of this track, and a record from another source is a warning.
   * `any`: every source can write it.
   * @default 'single'
   */
  stateOwner?: 'single' | 'any'
  /** Retention and sampling hints for the collector. */
  retention?: { keep: 'latest' | 'window', maxHz?: number, fullRateS?: number }
  /**
   * The `{key}` of the path that names the entity of the track, for example `actor` or `agent`. The viewer draws one
   * lane for each entity value, and tracks of different patterns with the same value share it.
   */
  entity?: string
  /** How the spans of the track show on the entity lane. A track without it shows only in the expanded rows. */
  activity?: TraceActivity
  /** An instant inside a span that changes its activity, for example `llm.first_chunk` from `thinking` to `active`. */
  activitySplit?: { instant: string, activity: TraceActivity }
  /**
   * What a span of this track shows on its item in the timeline. Leave it unset when the track name already tells what
   * a span is. Set `name` when the span names differ in a useful way, for example the tool name of a tool call. The
   * hover card shows the name in both cases.
   */
  itemLabel?: 'name'
}

export interface TraceAttributeDefinition extends TraceText {
  key: string
  type: 'string' | 'number' | 'boolean' | 'list' | 'asset' | 'json'
  unit?: string
  /**
   * `content` is user content. Files on disk and exports remove it unless a developer setting keeps it.
   * `secret` never leaves the process.
   */
  sensitivity: 'none' | 'content' | 'secret'
  aggregatable?: boolean
}

export interface TraceIdKeyDefinition extends TraceText {
  key: string
}

export interface TraceLinkDefinition extends TraceText {
  rel: string
}

export interface TraceEndReasonDefinition extends TraceText {
  reason: string
}

export interface TraceClockDefinition extends TraceText {
  /** A key pattern, for example `mono:window:{window}` or `audio:capture:{stream}`. */
  pattern: string
  /** `ms` for system clocks. `frames` for media streams. */
  unit: 'ms' | 'frames'
  /** Whether the clock stops during system sleep, when that is known. */
  stopsInSleep?: boolean
}

/** How a metric finds its values. */
export type TraceMetricValue
  /** The value is an attribute of a record. Any profile, a plugin profile too, can use this kind. */
  = | { kind: 'attribute', track: string, record: TraceRecordType, attribute: string }
  /** A first-party projection computes the value. */
    | { kind: 'derived', projection: string }

export type TraceAggregate = 'p50' | 'p95' | 'p99' | 'mean' | 'sum' | 'count'

export interface TraceMetricDefinition extends TraceText {
  key: string
  unit?: string
  /** Whether a larger value is better (`higher`) or a smaller value is better (`lower`). */
  better?: 'higher' | 'lower'
  /** ID keys that split the metric, for example `['from', 'to']` for a matrix of participant pairs. */
  dimensions?: string[]
  /** @default ['p50', 'p95'] */
  aggregate?: TraceAggregate[]
  /**
   * `session` keeps the values of the whole session. `window` uses the buffer only.
   * @default 'window'
   */
  scope?: 'session' | 'window'
  value: TraceMetricValue
}

/** An annotation name for a score from 0 to 1, where higher is better. */
export interface TraceScoreDefinition extends TraceText {
  key: string
  /** What usually produces the value. An annotation can name another annotator. */
  annotator?: TraceAnnotator
}

export interface TracePipelineStage {
  key: string
  label: Localizable
  /** Track path patterns. A pattern with `{key}` gives one stage instance for each value. */
  tracks: string[]
}

export interface TracePipelineDefinition extends TraceText {
  key: string
  stages: TracePipelineStage[]
  /** `kind` is open. The conventions define `cmd`, `data`, `audio`, and `signal`. Cycles are allowed. */
  edges: { from: string, to: string, kind: string, name: string }[]
}

/** A view preset: the track paths to show, and the layout. */
export interface TracePresetDefinition extends TraceText {
  key: string
  /** Track path patterns. */
  tracks: string[]
  /** @default 'timeline' */
  layout?: 'timeline' | 'pipeline' | 'log'
}

export interface TraceProfileDefinition extends TraceText {
  /** `voice`, `agent`, or `plugin:<id>`. */
  key: string
  version: string
  tracks?: TraceTrackDefinition[]
  attributes?: TraceAttributeDefinition[]
  idKeys?: TraceIdKeyDefinition[]
  links?: TraceLinkDefinition[]
  endReasons?: TraceEndReasonDefinition[]
  clocks?: TraceClockDefinition[]
  metrics?: TraceMetricDefinition[]
  scores?: TraceScoreDefinition[]
  pipelines?: TracePipelineDefinition[]
  presets?: TracePresetDefinition[]
}
