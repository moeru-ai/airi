import type {
  TraceAttributeDefinition,
  TraceClockDefinition,
  TraceEndReasonDefinition,
  TraceIdKeyDefinition,
  TraceLinkDefinition,
  TraceMetricDefinition,
  TracePipelineDefinition,
  TracePresetDefinition,
  TraceProfileDefinition,
  TraceScoreDefinition,
  TraceTrackDefinition,
} from './definitions'
import type { Localizable, TraceDefinitionKind, TraceRecordInput } from './types'

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
