import type { TraceRecord } from '../core/types'

export interface FlightRecorderDump {
  /** The records of the window, in buffer order. With `append`, only the records after the previous dump. */
  records: TraceRecord[]
  /** Append to the previous dump file. The window overlaps the previous dump. */
  append: boolean
  reason: 'error' | 'overdue'
  /** The window on the trace clock. */
  from: number
  to: number
}
