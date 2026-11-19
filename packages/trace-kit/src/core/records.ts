import type { TraceRecord, TraceRecordType, TraceSystemRecord, TraceTrackedRecord } from './types'

/**
 * Version of the record format. A reader upcasts an older minor format and rejects a newer major format.
 * `source.started.format` carries it.
 */
export const TRACE_FORMAT = 1

const SYSTEM_TYPES: ReadonlySet<TraceRecordType> = new Set([
  'source.started',
  'source.stopped',
  'source.lost',
  'clock.snapshot',
  'clock.discontinuity',
  'stream.started',
  'stream.stopped',
  'definition',
])

export function isSystemRecord(record: TraceRecord): record is TraceSystemRecord {
  return SYSTEM_TYPES.has(record.type)
}

export function isTrackedRecord(record: TraceRecord): record is TraceTrackedRecord {
  return 'track' in record && typeof record.track === 'string'
}
