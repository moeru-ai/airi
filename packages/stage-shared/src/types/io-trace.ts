/**
 * A tracing span that can cross the browser `BroadcastChannel` boundary.
 * Nanosecond timestamps use strings because structured clone cannot preserve the source integer format.
 */
export interface SerializedIOSpan {
  attributes: Record<string, unknown>
  ended: boolean
  endTimeNano: string
  events: Array<{ attributes: Record<string, unknown>, name: string, timeNano: string }>
  kind: number
  name: string
  parentSpanId: string
  spanId: string
  startTimeNano: string
  status: { code: number, message: string }
  traceId: string
}
