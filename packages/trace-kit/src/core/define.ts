import type { Localizable, TraceAnnotator, TraceDefinitionKind, TraceRecordInput, TraceRecordType } from './types'

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

export function defineTrack(definition: TraceTrackDefinition): TraceTrackDefinition {
  return definition
}

export function defineAttribute(definition: TraceAttributeDefinition): TraceAttributeDefinition {
  return definition
}

export function defineIdKey(definition: TraceIdKeyDefinition): TraceIdKeyDefinition {
  return definition
}

export function defineLink(definition: TraceLinkDefinition): TraceLinkDefinition {
  return definition
}

export function defineEndReason(definition: TraceEndReasonDefinition): TraceEndReasonDefinition {
  return definition
}

export function defineClock(definition: TraceClockDefinition): TraceClockDefinition {
  return definition
}

export function defineMetric(definition: TraceMetricDefinition): TraceMetricDefinition {
  return definition
}

export function defineScore(definition: TraceScoreDefinition): TraceScoreDefinition {
  return definition
}

export function definePipeline(definition: TracePipelineDefinition): TracePipelineDefinition {
  return definition
}

export function definePreset(definition: TracePresetDefinition): TracePresetDefinition {
  return definition
}

export function defineProfile(definition: TraceProfileDefinition): TraceProfileDefinition {
  return definition
}

/**
 * The definition records that announce a profile, in the order that a viewer needs them:
 * the profile first, then each of its definitions.
 */
export function definitionRecordsOf(profile: TraceProfileDefinition, ts: number): TraceRecordInput[] {
  const records: TraceRecordInput[] = []
  const push = (kind: TraceDefinitionKind, key: string, data: unknown) => records.push({ type: 'definition', ts, kind, key, data })

  const { tracks, attributes, idKeys, links, endReasons, clocks, metrics, scores, pipelines, presets, ...head } = profile
  push('profile', profile.key, head)
  for (const track of tracks ?? [])
    push('track', track.path, track)
  for (const attribute of attributes ?? [])
    push('attribute', attribute.key, attribute)
  for (const idKey of idKeys ?? [])
    push('id-key', idKey.key, idKey)
  for (const link of links ?? [])
    push('link', link.rel, link)
  for (const endReason of endReasons ?? [])
    push('end-reason', endReason.reason, endReason)
  for (const clock of clocks ?? [])
    push('clock', clock.pattern, clock)
  for (const metric of metrics ?? [])
    push('metric', metric.key, metric)
  for (const score of scores ?? [])
    push('score', score.key, score)
  for (const pipeline of pipelines ?? [])
    push('pipeline', pipeline.key, pipeline)
  for (const preset of presets ?? [])
    push('preset', preset.key, preset)
  return records
}

/**
 * Matches a track path against a path pattern.
 *
 * Returns the values of the `{key}` segments, or `undefined` when the path does not match.
 * A literal segment matches only itself. A `{key}` segment matches exactly one segment, and so does `*`, without a name.
 *
 * @example
 * matchTrackPath('participants/{actor}/speech', 'participants/user/speech')
 * // => { actor: 'user' }
 */
export function matchTrackPath(pattern: string, path: string): Record<string, string> | undefined {
  const patternSegments = pattern.split('/')
  const pathSegments = path.split('/')
  if (patternSegments.length !== pathSegments.length)
    return undefined

  const params: Record<string, string> = {}
  for (const [index, segment] of patternSegments.entries()) {
    const value = pathSegments[index]!
    if (segment.startsWith('{') && segment.endsWith('}'))
      params[segment.slice(1, -1)] = value
    else if (segment !== '*' && segment !== value)
      return undefined
  }
  return params
}

/**
 * Fills the `{key}` segments of a track path pattern.
 *
 * @example
 * trackPath('participants/{actor}/speech', { actor: 'user' })
 * // => 'participants/user/speech'
 */
export function trackPath(pattern: string, params: Record<string, string | number>): string {
  return pattern.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = params[key]
    if (value === undefined)
      throw new Error(`Track path ${pattern} needs the ID key ${key}`)
    return String(value)
  })
}

/** Returns the text for a locale, then English, then the first entry. */
export function localize(text: Localizable | undefined, locale: string): string | undefined {
  if (text === undefined || typeof text === 'string')
    return text
  return text[locale] ?? text[locale.split('-')[0]!] ?? text.en ?? Object.values(text)[0]
}
