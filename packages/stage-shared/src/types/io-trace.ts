/**
 * A tracing span that can cross the browser `BroadcastChannel` boundary.
 * Nanosecond timestamps use strings because structured clone cannot preserve the source integer format.
 */
export interface SerializedIOSpan {
  traceId: string
  spanId: string
  parentSpanId: string
  name: string
  kind: number
  startTimeNano: string
  endTimeNano: string
  attributes: Record<string, unknown>
  events: Array<{ name: string, timeNano: string, attributes: Record<string, unknown> }>
  status: { code: number, message: string }
  ended: boolean
}
