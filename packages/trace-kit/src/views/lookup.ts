import type { TraceLink, TraceRecord } from '../core/types'
import type { TimelineInstant, TimelineSpan, TimelineState, TimelineStateChange, TimelineTrack, TraceIndexes } from '../projections/types'
import type { TraceItemRef } from './types'

import { ATTR_GEN_AI_USAGE_INPUT_TOKENS, ATTR_GEN_AI_USAGE_OUTPUT_TOKENS } from '../conventions'
import { recordKey, spanKeyOf } from '../core/keys'

/** The span that a span ID names. The ID index gives its source and epoch. */
export function spanOfId(state: TimelineState, indexes: TraceIndexes, spanId: string): TimelineSpan | undefined {
  const begin = indexes.bySpanId.get(spanId)
  return begin ? state.spans.get(spanKeyOf(begin.source, begin.epoch, spanId)) : undefined
}

/** The spans of records, once each, in record order. A record without a span ID adds nothing. */
export function spansOfRecords(state: TimelineState, records: readonly TraceRecord[]): TimelineSpan[] {
  const spans = new Map<string, TimelineSpan>()
  for (const record of records) {
    if (!('spanId' in record) || !record.spanId)
      continue
    const span = state.spans.get(spanKeyOf(record.source, record.epoch, record.spanId))
    if (span)
      spans.set(span.key, span)
  }
  return [...spans.values()]
}

/** The spans that a link points to: the span of a span ID, or every span with a domain ID value. */
export function spansOfLink(link: TraceLink, state: TimelineState, indexes: TraceIndexes): TimelineSpan[] {
  if ('spanId' in link.to) {
    const span = spanOfId(state, indexes, link.to.spanId)
    return span ? [span] : []
  }
  if ('key' in link.to)
    return spansOfRecords(state, indexes.byId.get(`${link.to.key}=${link.to.id}`) ?? [])
  return []
}

/** The selection key of the item that a record belongs to: its span, or the record itself for an instant or a state. */
export function itemOfRecord(record: TraceRecord): TraceItemRef | undefined {
  if (record.type === 'span.begin' || record.type === 'span.end' || record.type === 'span.update' || record.type === 'span.complete')
    return { kind: 'span', key: spanKeyOf(record.source, record.epoch, record.spanId) }
  if (record.type === 'instant' || record.type === 'log')
    return { kind: 'instant', key: recordKey(record) }
  if (record.type === 'state')
    return { kind: 'state', key: recordKey(record) }
  return undefined
}

/** The item of a reference and its track. Instants and states need a scan of the tracks. */
export function findItem(state: TimelineState, ref: TraceItemRef): { track?: TimelineTrack, span?: TimelineSpan, instant?: TimelineInstant, change?: TimelineStateChange } {
  if (ref.kind === 'span') {
    const span = state.spans.get(ref.key)
    return { span, track: span ? state.tracks.get(span.track) : undefined }
  }
  for (const track of state.tracks.values()) {
    if (ref.kind === 'instant') {
      const instant = track.instants.find(candidate => candidate.key === ref.key)
      if (instant)
        return { track, instant }
    }
    else {
      const change = track.states.find(candidate => candidate.key === ref.key)
      if (change)
        return { track, change }
    }
  }
  return {}
}

/** The spans that a span encloses, in start order. Only direct children. */
export function childSpans(state: TimelineState, span: TimelineSpan): TimelineSpan[] {
  const children: TimelineSpan[] = []
  for (const candidate of state.spans.values()) {
    if (candidate.parentKey === span.key)
      children.push(candidate)
  }
  return children.sort((a, b) => a.start - b.start)
}

/** The input and output tokens of a model span. 0 for any other span. */
export function spanTokens(span: TimelineSpan): number {
  return Number(span.attrs[ATTR_GEN_AI_USAGE_INPUT_TOKENS] ?? 0) + Number(span.attrs[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS] ?? 0)
}

/** ID keys that many unrelated spans share. They do not make two spans related. */
const BROAD_ID_KEYS = new Set(['actor', 'conversation', 'agent', 'topic'])

/**
 * Keys of the records that relate to a span: spans that it links to, spans that link to it, and spans that share one
 * of its narrow ID values, such as a turn or an input. The view dims every other item.
 */
export function relatedSpanKeys(state: TimelineState, selected: TimelineSpan): Set<string> {
  const related = new Set<string>([selected.key])
  const targetIds = new Set<string>()
  for (const [key, value] of Object.entries(selected.ids ?? {})) {
    if (!BROAD_ID_KEYS.has(key))
      targetIds.add(`${key}=${value}`)
  }
  for (const link of selected.links) {
    if ('key' in link.to)
      targetIds.add(`${link.to.key}=${link.to.id}`)
  }

  for (const span of state.spans.values()) {
    if (span.key === selected.key)
      continue
    const linksToSelected = span.links.some(link => 'spanId' in link.to && link.to.spanId === selected.spanId)
    const selectedLinksTo = selected.links.some(link => 'spanId' in link.to && link.to.spanId === span.spanId)
    const sharesId = Object.entries(span.ids ?? {}).some(([key, value]) => !BROAD_ID_KEYS.has(key) && targetIds.has(`${key}=${value}`))
    if (linksToSelected || selectedLinksTo || sharesId || span.parentKey === selected.key || selected.parentKey === span.key)
      related.add(span.key)
  }
  return related
}
