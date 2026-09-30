import type { Buffer } from 'node:buffer'

import { duckDbBlob } from '@duckdbfan/drizzle-duckdb'
import { sql } from 'drizzle-orm'
import { bigint, boolean, customType, index, integer, pgTable, unique, varchar } from 'drizzle-orm/pg-core'

const hugeint = customType<{ data: bigint }>({ dataType: () => 'HUGEINT' })

export const metadata = pgTable('metadata', {
  key: varchar().primaryKey(),
  value: varchar().notNull(),
})

export const ingestBatches = pgTable('ingest_batches', {
  cursor: bigint({ mode: 'bigint' }).primaryKey().default(sql`nextval('debug_batch_cursor')`),
  signal: varchar().notNull(),
  contentType: varchar('content_type').notNull(),
  contentEncoding: varchar('content_encoding').notNull(),
  body: duckDbBlob('body').$type<Buffer>().notNull(),
  receivedUnixNano: hugeint('received_unix_nano').notNull(),
})

export const events = pgTable('events', {
  cursor: bigint({ mode: 'bigint' }).primaryKey().default(sql`nextval('debug_event_cursor')`),
  batchCursor: bigint('batch_cursor', { mode: 'bigint' }).notNull(),
  kind: varchar().notNull(),
  traceId: varchar('trace_id').notNull(),
  spanId: varchar('span_id').notNull(),
  parentSpanId: varchar('parent_span_id').notNull(),
  eventId: varchar('event_id').notNull(),
  sourceId: varchar('source_id').notNull(),
  serviceName: varchar('service_name').notNull(),
  sessionId: varchar('session_id').notNull(),
  name: varchar().notNull(),
  timeUnixNano: hugeint('time_unix_nano').notNull(),
  receivedUnixNano: hugeint('received_unix_nano').notNull(),
  spanEndTimeUnixNano: hugeint('span_end_time_unix_nano').notNull(),
  spanStatusCode: integer('span_status_code').notNull(),
  severityNumber: integer('severity_number').notNull(),
  severityText: varchar('severity_text').notNull(),
  resourceJson: varchar('resource_json').notNull(),
  resourceSchemaUrl: varchar('resource_schema_url').notNull(),
  scopeJson: varchar('scope_json').notNull(),
  scopeSchemaUrl: varchar('scope_schema_url').notNull(),
  rawJson: varchar('raw_json').notNull(),
  payloadHash: varchar('payload_hash').notNull(),
  uniqueKey: varchar('unique_key').unique('events_unique_key'),
}, table => [
  index('events_trace_cursor').using('art', table.traceId, table.cursor),
  index('events_span_cursor').using('art', table.spanId, table.cursor),
  index('events_source_cursor').using('art', table.sourceId, table.cursor),
])

export const sources = pgTable('sources', {
  cursor: bigint({ mode: 'bigint' }).primaryKey().default(sql`nextval('debug_source_cursor')`),
  sourceId: varchar('source_id').notNull(),
  serviceName: varchar('service_name').notNull(),
  firstSeenUnixNano: hugeint('first_seen_unix_nano').notNull(),
  lastSeenUnixNano: hugeint('last_seen_unix_nano').notNull(),
  eventCount: bigint('event_count', { mode: 'bigint' }).notNull(),
  sawSpans: boolean('saw_spans').notNull(),
  sawLogs: boolean('saw_logs').notNull(),
}, table => [unique('sources_source_service').on(table.sourceId, table.serviceName)])

export const traces = pgTable('traces', {
  cursor: bigint({ mode: 'bigint' }).primaryKey().default(sql`nextval('debug_trace_cursor')`),
  traceId: varchar('trace_id').notNull().unique(),
  sourceId: varchar('source_id').notNull(),
  sessionId: varchar('session_id').notNull(),
  firstSeenUnixNano: hugeint('first_seen_unix_nano').notNull(),
  lastSeenUnixNano: hugeint('last_seen_unix_nano').notNull(),
  state: integer().notNull(),
  spanCount: bigint('span_count', { mode: 'bigint' }).notNull(),
  logCount: bigint('log_count', { mode: 'bigint' }).notNull(),
  lastEventCursor: bigint('last_event_cursor', { mode: 'bigint' }).notNull(),
})
