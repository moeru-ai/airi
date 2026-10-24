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

/** Runtime state of the IO trace hub that the Electron main process owns. */
export interface IOTraceHubState {
  /** When true, the hub keeps recent spans in memory, so a tracer window that opens later can show them. */
  collecting: boolean
  /** Number of spans in memory. */
  bufferedSpans: number
  /** The hub drops the oldest span when it has more spans than this. */
  maxSpans: number
  /** The hub drops spans that ended earlier than this many milliseconds ago. */
  maxAgeMs: number
}

/** Runtime state for Electron-owned IO trace recording. */
export interface IOTraceRecordingState {
  directory: string
  enabled: boolean
  error?: string
  filePath?: string
}
