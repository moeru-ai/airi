import type { TimelineSpan, TimelineTrack } from '@proj-airi/trace-kit/projections'

import { TraceLinkRelations } from '@proj-airi/trace-kit'
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
