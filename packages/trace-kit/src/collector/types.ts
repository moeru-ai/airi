import type { TraceSeriesMessage } from '../core/feed'
import type { TraceRecord } from '../core/types'

/** A manual save of a collector. */
export interface CollectorSnapshot {
  /** The pinned set and the buffer, in the order of a backlog. */
  records: TraceRecord[]
  /** The series rings. The buffer does not hold samples. */
  series: TraceSeriesMessage[]
}

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
