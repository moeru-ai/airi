import type { MetricSamples } from '../projections/types'

import { createFloorTransferProjection } from '../profiles/voice'
import { createEventLogProjection } from '../projections/event-log'
import { createAttributeMetricsProjection } from '../projections/metrics'
import { TraceReader } from '../projections/reader'
import { createTimelineProjection } from '../projections/timeline'

/**
 * A reader with the projections that the trace views read: the timeline, the event log, and the metrics. The IO tracer
 * store and the stories read traces the same way.
 */
export function createTraceViewReader(traceClock: string) {
  const timeline = createTimelineProjection()
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
