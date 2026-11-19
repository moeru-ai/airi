import type { TraceRecord } from '@proj-airi/trace-kit'

import type { AudioInputSpan } from '../types'

import { createTimelineProjection, TraceReader } from '@proj-airi/trace-kit/projections'

/**
 * Folds the trace records of the pages into ended spans, in start order.
 *
 * The probe of each page hears the records of every page of the origin, so one record can come twice. The reader drops
 * the second copy. Open spans are left out, because tests assert on finished work.
 */
export function completedSpansOf(records: readonly TraceRecord[], name?: string): AudioInputSpan[] {
  const timeline = createTimelineProjection()
  const reader = new TraceReader([timeline])
  reader.handleRecords(records)

  const spans: AudioInputSpan[] = []
  for (const span of reader.view(timeline).spans.values()) {
    if (span.end === undefined || span.status === undefined || (name && span.name !== name))
      continue
    spans.push({
      spanId: span.spanId,
      name: span.name,
      track: span.track,
      ids: span.ids ?? {},
      attrs: span.attrs,
      start: span.start,
      end: span.end,
      status: span.status,
      ...(span.message ? { message: span.message } : {}),
    })
  }
  return spans.sort((left, right) => left.start - right.start)
}
