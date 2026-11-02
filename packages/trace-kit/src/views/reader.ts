import type { MetricSamples, TimelineProjectionOptions } from '../projections/types'

import { createFloorTransferProjection } from '../profiles/voice'
import { createEventLogProjection } from '../projections/event-log'
import { createAttributeMetricsProjection } from '../projections/metrics'
import { TraceReader } from '../projections/reader'
import { createTimelineProjection } from '../projections/timeline'

/**
 * A reader with the projections that the trace views read: the timeline, the event log, and the metrics. The IO tracer
 * store and the stories read traces the same way.
 *
 * A live view keeps the default series retention. A file replay passes `{ seriesRetention: false }`.
 */
export function createTraceViewReader(traceClock: string, options: TimelineProjectionOptions = {}) {
  const timeline = createTimelineProjection(options)
  const eventLog = createEventLogProjection()
  const attributeMetrics = createAttributeMetricsProjection()
  const floorTransfer = createFloorTransferProjection()
  const reader = new TraceReader([timeline, eventLog, attributeMetrics, floorTransfer], traceClock)
  return {
    reader,
    timelineView: () => reader.view(timeline),
    eventLogView: () => reader.view(eventLog),
    metricSamples: (): MetricSamples => ({ ...reader.view(attributeMetrics), ...reader.view(floorTransfer) }),
  }
}
