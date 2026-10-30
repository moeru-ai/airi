import type { TraceLink } from '@proj-airi/trace-kit'
import type { TimelineSpan, TimelineState, TimelineTrack, TraceIndexes } from '@proj-airi/trace-kit/projections'
import type { TraceItemRef } from '@proj-airi/trace-kit/views'

import { TraceLinkRelations } from '@proj-airi/trace-kit'
import { findItem, itemOfRecord, spansOfLink } from '@proj-airi/trace-kit/views'
import { formatDuration } from '@proj-airi/ui-timeline/headless'
import { upperFirst } from 'es-toolkit'

/**
 * The facts that every view of a span shows, as text: the activity of its track, how long it took or that it still
 * runs, and a status other than `ok`.
 *
 * @example
 * spanFacts(span, track, now)
 * // => { activity: 'thinking', duration: '820 ms', status: 'error: timeout' }
 */
export function spanFacts(span: TimelineSpan, track: TimelineTrack | undefined, now?: number): { activity?: string, duration: string, status?: string } {
  const duration = span.end !== undefined
    ? formatDuration(span.end - span.start)
    : span.abandoned
      ? 'abandoned'
      : now !== undefined ? `running ${formatDuration(now - span.start)}` : 'running'
  const status = span.status && span.status !== 'ok' ? (span.reason ? `${span.status}: ${span.reason}` : span.status) : undefined
  return { activity: track?.definition?.activity, duration, status }
}

const LINK_RELATION_LABELS: Record<string, string> = {
  [TraceLinkRelations.CausedBy]: 'Caused by',
  [TraceLinkRelations.CancelledBy]: 'Cancelled by',
  [TraceLinkRelations.RetryOf]: 'Retry of',
  [TraceLinkRelations.Supersedes]: 'Supersedes',
  [TraceLinkRelations.Revises]: 'Revises',
  [TraceLinkRelations.FollowsFrom]: 'Follows',
}

/**
 * The text of a link relation for a reader.
 *
 * @example
 * linkRelationLabel('caused-by')
 * // => 'Caused by'
 */
export function linkRelationLabel(rel: string): string {
  return LINK_RELATION_LABELS[rel] ?? upperFirst(rel)
}

/**
 * The targets of a link in this trace: spans, and the instants or state changes that a record reference names.
 *
 * `spansOfLink` resolves span IDs and domain IDs. A reference to one record resolves here through the record index,
 * so a link to a record of this trace does not show as missing.
 */
export function linkTargets(link: TraceLink, state: TimelineState, indexes: TraceIndexes): { spans: TimelineSpan[], items: (TraceItemRef & { label: string })[] } {
  if (!('seq' in link.to))
    return { spans: spansOfLink(link, state, indexes), items: [] }
  const record = indexes.byKey.get(link.to)
  const item = record ? itemOfRecord(record) : undefined
  if (!item)
    return { spans: [], items: [] }
  const found = findItem(state, item)
  if (found.span)
    return { spans: [found.span], items: [] }
  const label = found.instant?.name ?? found.change?.value
  return label === undefined ? { spans: [], items: [] } : { spans: [], items: [{ ...item, label }] }
}
