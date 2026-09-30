import type {
  V1EventKind,
  V1EventRecord,
  V1IngestBatch,
  V1Source,
  V1TraceState,
  V1TraceSummary,
} from '@proj-airi/stage-shared/debug'

import type { StoredBatch, StoredEvent, StoredSource, StoredTrace } from './storage'

import { Buffer } from 'node:buffer'

const traceStates = new Map<number, V1TraceState>([
  [0, 'TRACE_STATE_UNSPECIFIED'],
  [1, 'TRACE_STATE_INCOMPLETE'],
  [2, 'TRACE_STATE_COMPLETE'],
  [3, 'TRACE_STATE_ERROR'],
])

export function toEventRecord(event: StoredEvent): V1EventRecord {
  return {
    cursor: event.cursor,
    log: event.kind === 'log'
      ? { severityNumber: event.severityNumber, severityText: event.severityText }
      : undefined,
    name: event.name,
    parentSpanId: event.parentSpanId,
    rawJson: event.rawJson,
    receivedUnixNano: event.receivedUnixNano,
    resourceJson: event.resourceJson,
    resourceSchemaUrl: event.resourceSchemaUrl,
    sessionId: event.sessionId,
    scopeJson: event.scopeJson,
    scopeSchemaUrl: event.scopeSchemaUrl,
    sourceId: event.sourceId,
    span: event.kind === 'span'
      ? { endTimeUnixNano: event.spanEndTimeUnixNano, statusCode: event.spanStatusCode }
      : undefined,
    spanId: event.spanId,
    timeUnixNano: event.timeUnixNano,
    traceId: event.traceId,
  }
}

export function toTraceSummary(row: StoredTrace): V1TraceSummary {
  const state = traceStates.get(row.state)
  if (state === undefined)
    throw new Error(`Unknown stored trace state ${row.state}`)
  return {
    firstSeenUnixNano: row.firstSeenUnixNano.toString(),
    lastCursor: row.lastEventCursor.toString(),
    lastSeenUnixNano: row.lastSeenUnixNano.toString(),
    logCount: row.logCount.toString(),
    sessionId: row.sessionId,
    sourceId: row.sourceId,
    spanCount: row.spanCount.toString(),
    state,
    traceId: row.traceId,
  }
}

export function toSource(row: StoredSource): V1Source {
  const signals: string[] = []
  if (row.sawSpans)
    signals.push('traces')
  if (row.sawLogs)
    signals.push('logs')
  return {
    eventCount: row.eventCount.toString(),
    firstSeenUnixNano: row.firstSeenUnixNano.toString(),
    lastSeenUnixNano: row.lastSeenUnixNano.toString(),
    serviceName: row.serviceName,
    signals,
    sourceId: row.sourceId,
  }
}

export function toExportBatch(row: StoredBatch): V1IngestBatch {
  let kind: V1EventKind
  if (row.signal === 'span')
    kind = 'EVENT_KIND_SPAN'
  else if (row.signal === 'log')
    kind = 'EVENT_KIND_LOG'
  else
    throw new Error(`Unknown stored signal ${row.signal}`)
  return {
    body: Buffer.from(row.body).toString('base64'),
    contentEncoding: row.contentEncoding,
    contentType: row.contentType,
    cursor: row.cursor.toString(),
    kind,
    receivedUnixNano: row.receivedUnixNano.toString(),
  }
}
