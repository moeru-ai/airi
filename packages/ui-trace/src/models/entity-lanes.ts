import type { TraceActivity } from '@proj-airi/trace-kit'
import type { TimelineSpan, TimelineState, TimelineTrack, TraceIndexes } from '@proj-airi/trace-kit/projections'

import { ATTR_GEN_AI_REQUEST_MODEL, TraceLinkRelations } from '@proj-airi/trace-kit'
import { spansOfLink, spanTokens } from '@proj-airi/trace-kit/views'
import { upperFirst } from 'es-toolkit'

/**
 * One lane of the timeline: everything that one entity does, such as a participant, an agent, or a conversation.
 *
 * Tracks of different profiles that name the same entity share one lane. For example, `participants/agent/playback`
 * and `agents/agent/llm` both belong to the entity `agent`.
 */
export interface EntityLane {
  key: string
  label: string
  /** For example the model of the latest request of an agent. */
  subtitle?: string
  kind: 'participant' | 'conversation' | 'group'
  color: string
  tracks: TimelineTrack[]
  segments: EntitySegment[]
  /** A span of the entity is open and not abandoned. */
  running: boolean
  failed: boolean
}

/** A part of a span, drawn on the entity lane with the style of its activity. */
export interface EntitySegment {
  spanKey: string
  name: string
  start: number
  /** Undefined while the span runs. */
  end?: number
  activity: TraceActivity
  failed: boolean
  cancelled: boolean
  abandoned: boolean
  /** The span retries an earlier span. */
  retry: boolean
}

/**
 * A handoff between two lanes, drawn as an elbow with a dot at each end.
 *
 * - `call`: work of `to` starts because of `from`, through a `caused-by` link or a parent span on another lane.
 * - `return`: work of `from` that a parent on `to` started ends, so the parent continues.
 */
export interface EntityConnector {
  key: string
  time: number
  from: string
  to: string
  kind: 'call' | 'return'
  spanKey: string
}

/** Lane colors in first-seen order. The first participant is the user, so it gets the first color. */
const LANE_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#d946ef', '#06b6d4', '#14b8a6', '#84cc16']

/** ID keys whose values name the same kind of entity. A voice actor and an agent with one value are one entity. */
const PARTICIPANT_KEYS = new Set(['actor', 'agent'])

const KIND_ORDER: Record<EntityLane['kind'], number> = { participant: 0, conversation: 1, group: 2 }

function entityOf(track: TimelineTrack): { key: string, kind: EntityLane['kind'], value: string } {
  const entityKey = track.definition?.entity
  const value = entityKey ? track.params[entityKey] : undefined
  if (entityKey && value !== undefined) {
    if (PARTICIPANT_KEYS.has(entityKey))
      return { key: `participant:${value}`, kind: 'participant', value }
    return { key: `${entityKey}:${value}`, kind: 'conversation', value }
  }
  const group = track.definition?.group ?? 'other'
  return { key: `group:${group}`, kind: 'group', value: group }
}

/** Splits a span into segments by the activity of its track. */
function segmentsOf(span: TimelineSpan, track: TimelineTrack): EntitySegment[] {
  const definition = track.definition
  const activity = definition?.activity
  if (!activity)
    return []

  const base = {
    spanKey: span.key,
    name: span.name,
    failed: span.status === 'error',
    cancelled: span.status === 'cancelled',
    abandoned: span.abandoned === true,
    retry: span.links.some(link => link.rel === TraceLinkRelations.RetryOf),
  }
  // An abandoned span has no end. It is drawn as a short mark at its start.
  const end = span.end ?? (span.abandoned ? span.start : undefined)
  const split = definition.activitySplit
  const at = split ? span.instants.find(instant => instant.name === split.instant)?.time : undefined
  if (!split || at === undefined)
    return [{ ...base, start: span.start, end, activity }]

  return [
    { ...base, start: span.start, end: at, activity, failed: false },
    { ...base, start: at, end, activity: split.activity },
  ]
}

/**
 * Builds the entity lanes and the handoffs between them.
 *
 * Lane order: participants, then conversations, then group lanes, each in the order that their first span starts.
 * Handoffs come from `caused-by` links and from parents on another lane. A link to an ID, such as the input of a turn,
 * uses the earliest span with that ID on another lane.
 */
export function buildEntityLanes(state: TimelineState, indexes: TraceIndexes, hidden: ReadonlySet<string> = new Set()): { lanes: EntityLane[], connectors: EntityConnector[] } {
  const lanes = new Map<string, EntityLane & { firstStart: number }>()
  const laneOfSpan = new Map<string, string>()

  for (const track of state.tracks.values()) {
    // A hidden track draws nothing, and no connector starts or ends at its spans.
    if (hidden.has(track.path))
      continue
    const entity = entityOf(track)
    let lane = lanes.get(entity.key)
    if (!lane) {
      const label = entity.kind === 'participant' && entity.value === 'user' ? 'User' : upperFirst(entity.value)
      lane = { key: entity.key, label: entity.kind === 'conversation' ? `Conversation ${entity.value.slice(0, 8)}` : label, kind: entity.kind, color: '', tracks: [], segments: [], running: false, failed: false, firstStart: Number.POSITIVE_INFINITY }
      lanes.set(entity.key, lane)
    }
    lane.tracks.push(track)
    for (const span of track.spans) {
      laneOfSpan.set(span.key, entity.key)
      lane.firstStart = Math.min(lane.firstStart, span.start)
      lane.segments.push(...segmentsOf(span, track))
      lane.running ||= span.end === undefined && !span.abandoned && track.definition?.activity !== undefined
      lane.failed ||= span.status === 'error'
      const model = span.attrs[ATTR_GEN_AI_REQUEST_MODEL]
      if (typeof model === 'string')
        lane.subtitle = model
    }
  }

  const ordered = [...lanes.values()]
    .filter(lane => lane.tracks.some(track => track.spans.length > 0 || track.instants.length > 0 || track.states.length > 0))
    .sort((a, b) => {
      if (a.kind !== b.kind)
        return KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
      if ((a.key === 'participant:user') !== (b.key === 'participant:user'))
        return a.key === 'participant:user' ? -1 : 1
      return a.firstStart - b.firstStart
    })
  for (const [index, lane] of ordered.entries()) {
    lane.color = LANE_COLORS[index % LANE_COLORS.length]!
    // Waiting draws below thinking, and thinking below active work.
    lane.segments.sort((a, b) => activityRank(a.activity) - activityRank(b.activity) || a.start - b.start)
  }

  const connectors: EntityConnector[] = []
  const seen = new Set<string>()
  for (const span of state.spans.values()) {
    const to = laneOfSpan.get(span.key)
    if (!to)
      continue

    const parent = span.parentKey ? state.spans.get(span.parentKey) : undefined
    const parentLane = parent ? laneOfSpan.get(parent.key) : undefined
    if (parent && parentLane && parentLane !== to) {
      connectors.push({ key: `${span.key}:call`, time: span.start, from: parentLane, to, kind: 'call', spanKey: span.key })
      if (span.end !== undefined)
        connectors.push({ key: `${span.key}:return`, time: span.end, from: to, to: parentLane, kind: 'return', spanKey: span.key })
      continue
    }

    for (const link of span.links) {
      if (link.rel !== TraceLinkRelations.CausedBy)
        continue
      const causes = spansOfLink(link, state, indexes)
        .filter(cause => laneOfSpan.get(cause.key) !== undefined && laneOfSpan.get(cause.key) !== to)
        .sort((a, b) => a.start - b.start)
      const cause = causes[0]
      if (!cause)
        continue
      const key = `${span.key}:cause`
      if (seen.has(key))
        continue
      seen.add(key)
      connectors.push({ key, time: span.start, from: laneOfSpan.get(cause.key)!, to, kind: 'call', spanKey: span.key })
    }
  }

  return { lanes: ordered, connectors }
}

function activityRank(activity: TraceActivity): number {
  return activity === 'waiting' ? 0 : activity === 'thinking' ? 1 : 2
}

/** Summary of the session for the header: whether work runs, how long the timeline is, and the tokens used. */
export function sessionSummary(state: TimelineState, lanes: EntityLane[]): { running: boolean, durationMs: number, tokens: number } {
  let tokens = 0
  for (const span of state.spans.values())
    tokens += spanTokens(span)
  return {
    running: lanes.some(lane => lane.running),
    durationMs: Number.isFinite(state.start) ? state.end - state.start : 0,
    tokens,
  }
}
