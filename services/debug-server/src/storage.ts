import type { DuckDBConnection, DuckDBInstance } from '@duckdb/node-api'

import type { IngestRecord, Signal } from './protocol'

import { createHash } from 'node:crypto'

import { blobValue, DuckDBInstance as NativeDuckDBInstance } from '@duckdb/node-api'
import { errorMessageFromUnknown } from '@proj-airi/stage-shared/error-message'

export interface StorageOptions {
  path: string
  retentionDays: number
  maxStoredBytes: number
}

export interface StoredEvent {
  cursor: string
  kind: Signal
  name: string
  parentSpanId: string
  rawJson: string
  receivedUnixNano: string
  resourceJson: string
  resourceSchemaUrl: string
  sessionId: string
  severityNumber: number
  severityText: string
  sourceId: string
  scopeJson: string
  scopeSchemaUrl: string
  spanEndTimeUnixNano: string
  spanId: string
  spanStatusCode: number
  timeUnixNano: string
  traceId: string
}

export interface EventQuery {
  afterCursor: string
  kind?: Signal
  pageSize: number
  sessionId?: string
  sourceId?: string
  spanId?: string
  traceId?: string
}

export interface TraceQuery {
  afterCursor: string
  pageSize: number
  sessionId?: string
  sourceId?: string
  startedAfterUnixNano?: string
  state?: number
}

export interface SourceQuery {
  afterCursor: string
  pageSize: number
}

export interface IngestResult {
  conflicts: string[]
  inserted: number
}

export class CursorExpiredError extends Error {
  constructor(public readonly firstAvailableCursor: string) {
    super(`Cursor expired. First available cursor is ${firstAvailableCursor}`)
  }
}

type Row = Record<string, unknown>

function requiredBigInt(row: Row, key: string): bigint {
  const value = row[key]
  if (typeof value !== 'bigint')
    throw new Error(`DuckDB column ${key} is not a bigint`)
  return value
}

function requiredString(row: Row, key: string): string {
  const value = row[key]
  if (typeof value !== 'string')
    throw new Error(`DuckDB column ${key} is not a string`)
  return value
}

function requiredNumber(row: Row, key: string): number {
  const value = row[key]
  if (typeof value !== 'number')
    throw new Error(`DuckDB column ${key} is not a number`)
  return value
}

function nullableString(row: Row, key: string): string {
  const value = row[key]
  if (value === null)
    return ''
  return requiredString(row, key)
}

function hashRecord(record: IngestRecord): string {
  return createHash('sha256')
    .update(record.resourceJson)
    .update('\0')
    .update(record.resourceSchemaUrl)
    .update('\0')
    .update(record.scopeJson)
    .update('\0')
    .update(record.scopeSchemaUrl)
    .update('\0')
    .update(record.rawJson)
    .digest('hex')
}

function uniqueKey(record: IngestRecord): string | null {
  if (record.kind === 'span')
    return `span:${record.traceId}:${record.spanId}`
  if (record.eventId && record.sourceId)
    return `log:${record.sourceId}:${record.eventId}`
  return null
}

function traceState(record: IngestRecord): number {
  if (record.kind === 'span' && record.spanStatusCode === 2)
    return 3
  if (record.kind !== 'span' || record.parentSpanId || record.spanEndTimeUnixNano === '0')
    return 1
  return record.spanStatusCode === 2 ? 3 : 2
}

export class DebugStorage {
  private constructor(
    private readonly instance: DuckDBInstance,
    private readonly connection: DuckDBConnection,
    private readonly reader: DuckDBConnection,
    private readonly options: StorageOptions,
  ) {}

  private queue: Promise<void> = Promise.resolve()
  private maintenanceError = ''

  static async open(options: StorageOptions): Promise<DebugStorage> {
    const instance = await NativeDuckDBInstance.create(options.path)
    const connection = await instance.connect()
    const reader = await instance.connect()
    const storage = new DebugStorage(instance, connection, reader, options)
    await storage.initialize()
    await storage.pruneInternal()
    return storage
  }

  private async initialize(): Promise<void> {
    await this.connection.run(`
      CREATE SEQUENCE IF NOT EXISTS debug_batch_cursor START 1;
      CREATE SEQUENCE IF NOT EXISTS debug_event_cursor START 1;
      CREATE SEQUENCE IF NOT EXISTS debug_source_cursor START 1;
      CREATE SEQUENCE IF NOT EXISTS debug_trace_cursor START 1;

      CREATE TABLE IF NOT EXISTS metadata (
        key VARCHAR PRIMARY KEY,
        value VARCHAR NOT NULL
      );
      INSERT INTO metadata VALUES ('events_pruned_through', '0') ON CONFLICT DO NOTHING;
      INSERT INTO metadata VALUES ('sources_pruned_through', '0') ON CONFLICT DO NOTHING;
      INSERT INTO metadata VALUES ('traces_pruned_through', '0') ON CONFLICT DO NOTHING;

      CREATE TABLE IF NOT EXISTS ingest_batches (
        cursor BIGINT PRIMARY KEY DEFAULT nextval('debug_batch_cursor'),
        signal VARCHAR NOT NULL,
        content_type VARCHAR NOT NULL,
        content_encoding VARCHAR NOT NULL,
        body BLOB NOT NULL,
        received_unix_nano HUGEINT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS events (
        cursor BIGINT PRIMARY KEY DEFAULT nextval('debug_event_cursor'),
        batch_cursor BIGINT NOT NULL,
        kind VARCHAR NOT NULL,
        trace_id VARCHAR NOT NULL,
        span_id VARCHAR NOT NULL,
        parent_span_id VARCHAR NOT NULL,
        event_id VARCHAR NOT NULL,
        source_id VARCHAR NOT NULL,
        service_name VARCHAR NOT NULL,
        session_id VARCHAR NOT NULL,
        name VARCHAR NOT NULL,
        time_unix_nano HUGEINT NOT NULL,
        received_unix_nano HUGEINT NOT NULL,
        span_end_time_unix_nano HUGEINT NOT NULL,
        span_status_code INTEGER NOT NULL,
        severity_number INTEGER NOT NULL,
        severity_text VARCHAR NOT NULL,
        resource_json VARCHAR NOT NULL,
        resource_schema_url VARCHAR NOT NULL,
        scope_json VARCHAR NOT NULL,
        scope_schema_url VARCHAR NOT NULL,
        raw_json VARCHAR NOT NULL,
        payload_hash VARCHAR NOT NULL,
        unique_key VARCHAR
      );

      CREATE UNIQUE INDEX IF NOT EXISTS events_unique_key ON events(unique_key);
      CREATE INDEX IF NOT EXISTS events_trace_cursor ON events(trace_id, cursor);
      CREATE INDEX IF NOT EXISTS events_span_cursor ON events(span_id, cursor);
      CREATE INDEX IF NOT EXISTS events_source_cursor ON events(source_id, cursor);

      CREATE TABLE IF NOT EXISTS sources (
        cursor BIGINT PRIMARY KEY DEFAULT nextval('debug_source_cursor'),
        source_id VARCHAR NOT NULL,
        service_name VARCHAR NOT NULL,
        first_seen_unix_nano HUGEINT NOT NULL,
        last_seen_unix_nano HUGEINT NOT NULL,
        event_count BIGINT NOT NULL,
        saw_spans BOOLEAN NOT NULL,
        saw_logs BOOLEAN NOT NULL,
        UNIQUE(source_id, service_name)
      );

      CREATE TABLE IF NOT EXISTS traces (
        cursor BIGINT PRIMARY KEY DEFAULT nextval('debug_trace_cursor'),
        trace_id VARCHAR NOT NULL UNIQUE,
        source_id VARCHAR NOT NULL,
        session_id VARCHAR NOT NULL,
        first_seen_unix_nano HUGEINT NOT NULL,
        last_seen_unix_nano HUGEINT NOT NULL,
        state INTEGER NOT NULL,
        span_count BIGINT NOT NULL,
        log_count BIGINT NOT NULL,
        last_event_cursor BIGINT NOT NULL
      );

      ALTER TABLE events ADD COLUMN IF NOT EXISTS resource_schema_url VARCHAR DEFAULT '';
      ALTER TABLE events ADD COLUMN IF NOT EXISTS scope_schema_url VARCHAR DEFAULT '';
    `)
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation)
    this.queue = result.then(() => undefined, () => undefined)
    return result
  }

  async ingest(input: {
    body: Uint8Array
    contentEncoding: string
    contentType: string
    receivedUnixNano: string
    records: IngestRecord[]
    signal: Signal
  }): Promise<IngestResult> {
    return this.serialize(async () => {
      await this.connection.run('BEGIN TRANSACTION')
      try {
        const batchResult = await this.connection.runAndReadAll(
          `INSERT INTO ingest_batches (signal, content_type, content_encoding, body, received_unix_nano)
           VALUES (?, ?, ?, ?, ?) RETURNING cursor`,
          [input.signal, input.contentType, input.contentEncoding, blobValue(input.body), BigInt(input.receivedUnixNano)],
        )
        const batchRows = batchResult.getRowObjectsJS()
        if (batchRows.length !== 1)
          throw new Error('DuckDB did not return an ingest batch cursor')
        const batchCursor = requiredBigInt(batchRows[0], 'cursor')
        const conflicts: string[] = []
        let inserted = 0

        for (const record of input.records) {
          const key = uniqueKey(record)
          const payloadHash = hashRecord(record)
          if (key) {
            const existingResult = await this.connection.runAndReadAll(
              'SELECT payload_hash FROM events WHERE unique_key = ?',
              [key],
            )
            const existingRows = existingResult.getRowObjectsJS()
            if (existingRows.length > 0) {
              if (requiredString(existingRows[0], 'payload_hash') !== payloadHash)
                conflicts.push(key)
              continue
            }
          }

          const insertedResult = await this.connection.runAndReadAll(
            `INSERT INTO events (
              batch_cursor, kind, trace_id, span_id, parent_span_id, event_id,
              source_id, service_name, session_id, name, time_unix_nano,
              received_unix_nano, span_end_time_unix_nano, span_status_code,
              severity_number, severity_text, resource_json, resource_schema_url,
              scope_json, scope_schema_url, raw_json, payload_hash, unique_key
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING cursor`,
            [
              batchCursor,
              record.kind,
              record.traceId,
              record.spanId,
              record.parentSpanId,
              record.eventId,
              record.sourceId,
              record.serviceName,
              record.sessionId,
              record.name,
              BigInt(record.timeUnixNano),
              BigInt(record.receivedUnixNano),
              BigInt(record.spanEndTimeUnixNano),
              record.spanStatusCode,
              record.severityNumber,
              record.severityText,
              record.resourceJson,
              record.resourceSchemaUrl,
              record.scopeJson,
              record.scopeSchemaUrl,
              record.rawJson,
              payloadHash,
              key,
            ],
          )
          const insertedRows = insertedResult.getRowObjectsJS()
          if (insertedRows.length !== 1)
            throw new Error('DuckDB did not return an event cursor')
          const eventCursor = requiredBigInt(insertedRows[0], 'cursor')
          inserted++

          await this.connection.run(
            `INSERT INTO sources (
              source_id, service_name, first_seen_unix_nano, last_seen_unix_nano,
              event_count, saw_spans, saw_logs
            ) VALUES (?, ?, ?, ?, 1, ?, ?)
            ON CONFLICT (source_id, service_name) DO UPDATE SET
              first_seen_unix_nano = least(sources.first_seen_unix_nano, excluded.first_seen_unix_nano),
              last_seen_unix_nano = greatest(sources.last_seen_unix_nano, excluded.last_seen_unix_nano),
              event_count = sources.event_count + 1,
              saw_spans = sources.saw_spans OR excluded.saw_spans,
              saw_logs = sources.saw_logs OR excluded.saw_logs`,
            [
              record.sourceId,
              record.serviceName,
              BigInt(record.receivedUnixNano),
              BigInt(record.receivedUnixNano),
              record.kind === 'span',
              record.kind === 'log',
            ],
          )

          if (record.traceId) {
            const state = traceState(record)
            await this.connection.run(
              `INSERT INTO traces (
                trace_id, source_id, session_id, first_seen_unix_nano,
                last_seen_unix_nano, state, span_count, log_count, last_event_cursor
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT (trace_id) DO UPDATE SET
                source_id = CASE
                  WHEN excluded.source_id = '' OR traces.source_id = excluded.source_id THEN traces.source_id
                  ELSE ''
                END,
                session_id = CASE
                  WHEN excluded.session_id = '' OR traces.session_id = excluded.session_id THEN traces.session_id
                  ELSE ''
                END,
                first_seen_unix_nano = least(traces.first_seen_unix_nano, excluded.first_seen_unix_nano),
                last_seen_unix_nano = greatest(traces.last_seen_unix_nano, excluded.last_seen_unix_nano),
                state = greatest(traces.state, excluded.state),
                span_count = traces.span_count + excluded.span_count,
                log_count = traces.log_count + excluded.log_count,
                last_event_cursor = greatest(traces.last_event_cursor, excluded.last_event_cursor)`,
              [
                record.traceId,
                record.sourceId,
                record.sessionId,
                BigInt(record.timeUnixNano),
                BigInt(record.kind === 'span' ? record.spanEndTimeUnixNano : record.timeUnixNano),
                state,
                record.kind === 'span' ? 1n : 0n,
                record.kind === 'log' ? 1n : 0n,
                eventCursor,
              ],
            )
          }
        }

        await this.connection.run('COMMIT')
        try {
          await this.pruneInternal()
          this.maintenanceError = ''
        }
        catch (error) {
          this.maintenanceError = errorMessageFromUnknown(error)
          console.error('[debug-server] Retention maintenance failed after a committed ingest', error)
        }
        return { conflicts, inserted }
      }
      catch (error) {
        await this.connection.run('ROLLBACK')
        throw error
      }
    })
  }

  private async checkCursor(table: 'events' | 'sources' | 'traces', afterCursor: string): Promise<void> {
    if (!afterCursor || afterCursor === '0')
      return
    const result = await this.reader.runAndReadAll(`SELECT min(cursor) AS first_cursor FROM ${table}`)
    const rows = result.getRowObjectsJS()
    if (rows.length !== 1)
      return
    const watermarkResult = await this.reader.runAndReadAll('SELECT value FROM metadata WHERE key = ?', [`${table}_pruned_through`])
    const watermarkRows = watermarkResult.getRowObjectsJS()
    const watermark = watermarkRows.length === 1 ? BigInt(requiredString(watermarkRows[0], 'value')) : 0n
    if (BigInt(afterCursor) < watermark)
      throw new CursorExpiredError(rows[0].first_cursor === null ? (watermark + 1n).toString() : requiredBigInt(rows[0], 'first_cursor').toString())
  }

  async listEvents(query: EventQuery): Promise<{ events: StoredEvent[], nextCursor: string }> {
    await this.checkCursor('events', query.afterCursor)
    const clauses = ['cursor > ?']
    const values: Array<string | number | bigint> = [BigInt(query.afterCursor || '0')]
    for (const [column, value] of [
      ['trace_id', query.traceId],
      ['span_id', query.spanId],
      ['source_id', query.sourceId],
      ['session_id', query.sessionId],
      ['kind', query.kind],
    ] as const) {
      if (value !== undefined) {
        clauses.push(`${column} = ?`)
        values.push(value)
      }
    }
    values.push(query.pageSize + 1)
    const result = await this.reader.runAndReadAll(
      `SELECT * FROM events WHERE ${clauses.join(' AND ')} ORDER BY cursor ASC LIMIT ?`,
      values,
    )
    const rows = result.getRowObjectsJS()
    const hasMore = rows.length > query.pageSize
    const page = rows.slice(0, query.pageSize)
    return {
      events: page.map(row => ({
        cursor: requiredBigInt(row, 'cursor').toString(),
        kind: requiredString(row, 'kind') as Signal,
        name: requiredString(row, 'name'),
        parentSpanId: requiredString(row, 'parent_span_id'),
        rawJson: requiredString(row, 'raw_json'),
        receivedUnixNano: requiredBigInt(row, 'received_unix_nano').toString(),
        resourceJson: requiredString(row, 'resource_json'),
        resourceSchemaUrl: requiredString(row, 'resource_schema_url'),
        sessionId: requiredString(row, 'session_id'),
        severityNumber: requiredNumber(row, 'severity_number'),
        severityText: requiredString(row, 'severity_text'),
        sourceId: requiredString(row, 'source_id'),
        scopeJson: requiredString(row, 'scope_json'),
        scopeSchemaUrl: requiredString(row, 'scope_schema_url'),
        spanEndTimeUnixNano: requiredBigInt(row, 'span_end_time_unix_nano').toString(),
        spanId: requiredString(row, 'span_id'),
        spanStatusCode: requiredNumber(row, 'span_status_code'),
        timeUnixNano: requiredBigInt(row, 'time_unix_nano').toString(),
        traceId: requiredString(row, 'trace_id'),
      })),
      nextCursor: hasMore && page.length > 0 ? requiredBigInt(page.at(-1)!, 'cursor').toString() : '',
    }
  }

  async listSources(query: SourceQuery): Promise<{ firstCursor: string, lastCursor: string, nextCursor: string, sources: Row[] }> {
    await this.checkCursor('sources', query.afterCursor)
    const result = await this.reader.runAndReadAll(
      'SELECT * FROM sources WHERE cursor > ? ORDER BY cursor ASC LIMIT ?',
      [BigInt(query.afterCursor || '0'), query.pageSize + 1],
    )
    const rows = result.getRowObjectsJS()
    const hasMore = rows.length > query.pageSize
    const page = rows.slice(0, query.pageSize)
    const boundsResult = await this.reader.runAndReadAll('SELECT min(cursor) AS first_cursor, max(cursor) AS last_cursor FROM sources')
    const bounds = boundsResult.getRowObjectsJS()[0]
    return {
      firstCursor: bounds?.first_cursor === null || bounds === undefined ? '' : requiredBigInt(bounds, 'first_cursor').toString(),
      lastCursor: bounds?.last_cursor === null || bounds === undefined ? '' : requiredBigInt(bounds, 'last_cursor').toString(),
      nextCursor: hasMore && page.length > 0 ? requiredBigInt(page.at(-1)!, 'cursor').toString() : '',
      sources: page,
    }
  }

  async listTraces(query: TraceQuery): Promise<{ nextCursor: string, traces: Row[] }> {
    await this.checkCursor('traces', query.afterCursor)
    const clauses = ['t.cursor > ?']
    const values: Array<string | number | bigint> = [BigInt(query.afterCursor || '0')]
    for (const [column, value] of [
      ['source_id', query.sourceId],
      ['session_id', query.sessionId],
      ['state', query.state],
    ] as const) {
      if (value === undefined)
        continue
      if (column === 'state') {
        clauses.push('t.state = ?')
        values.push(value)
      }
      else {
        clauses.push(`EXISTS (SELECT 1 FROM events e WHERE e.trace_id = t.trace_id AND e.${column} = ?)`)
        values.push(value)
      }
    }
    if (query.startedAfterUnixNano !== undefined) {
      clauses.push('t.first_seen_unix_nano >= ?')
      values.push(BigInt(query.startedAfterUnixNano))
    }
    values.push(query.pageSize + 1)
    const result = await this.reader.runAndReadAll(
      `SELECT t.* FROM traces t WHERE ${clauses.join(' AND ')} ORDER BY t.cursor ASC LIMIT ?`,
      values,
    )
    const rows = result.getRowObjectsJS()
    const hasMore = rows.length > query.pageSize
    const page = rows.slice(0, query.pageSize)
    return {
      nextCursor: hasMore && page.length > 0 ? requiredBigInt(page.at(-1)!, 'cursor').toString() : '',
      traces: page,
    }
  }

  async getTrace(traceId: string): Promise<Row | undefined> {
    const result = await this.reader.runAndReadAll('SELECT * FROM traces WHERE trace_id = ?', [traceId])
    return result.getRowObjectsJS()[0]
  }

  async exportRecords(afterCursor: string, pageSize: number): Promise<{ batches: Row[], events: StoredEvent[], nextCursor: string }> {
    const eventPage = await this.listEvents({ afterCursor, pageSize })
    if (eventPage.events.length === 0)
      return { batches: [], events: [], nextCursor: '' }
    const batchResult = await this.reader.runAndReadAll(
      `SELECT DISTINCT b.* FROM ingest_batches b
       JOIN events e ON e.batch_cursor = b.cursor
       WHERE e.cursor > ? AND e.cursor <= ? ORDER BY b.cursor ASC`,
      [BigInt(afterCursor || '0'), BigInt(eventPage.events.at(-1)!.cursor)],
    )
    return { batches: batchResult.getRowObjectsJS(), events: eventPage.events, nextCursor: eventPage.nextCursor }
  }

  private async setPrunedWatermark(table: 'events' | 'sources' | 'traces', cursor: bigint): Promise<void> {
    await this.connection.run(
      `UPDATE metadata SET value = greatest(CAST(value AS BIGINT), ?)::VARCHAR
       WHERE key = ?`,
      [cursor, `${table}_pruned_through`],
    )
  }

  private async rebuildSummaries(): Promise<void> {
    await this.connection.run(`
      CREATE OR REPLACE TEMP TABLE current_sources AS
      SELECT source_id, service_name,
        min(received_unix_nano) AS first_seen_unix_nano,
        max(received_unix_nano) AS last_seen_unix_nano,
        count(*) AS event_count,
        bool_or(kind = 'span') AS saw_spans,
        bool_or(kind = 'log') AS saw_logs
      FROM events GROUP BY source_id, service_name;
    `)

    const deletedSourceResult = await this.connection.runAndReadAll(`
      SELECT max(cursor) AS cursor FROM sources
      WHERE NOT EXISTS (
        SELECT 1 FROM current_sources c
        WHERE c.source_id = sources.source_id AND c.service_name = sources.service_name
      )
    `)
    const deletedSourceRows = deletedSourceResult.getRowObjectsJS()
    if (deletedSourceRows.length === 1 && deletedSourceRows[0].cursor !== null)
      await this.setPrunedWatermark('sources', requiredBigInt(deletedSourceRows[0], 'cursor'))

    await this.connection.run(`

      DELETE FROM sources
      WHERE NOT EXISTS (
        SELECT 1 FROM current_sources c
        WHERE c.source_id = sources.source_id AND c.service_name = sources.service_name
      );

      UPDATE sources SET
        first_seen_unix_nano = c.first_seen_unix_nano,
        last_seen_unix_nano = c.last_seen_unix_nano,
        event_count = c.event_count,
        saw_spans = c.saw_spans,
        saw_logs = c.saw_logs
      FROM current_sources c
      WHERE c.source_id = sources.source_id AND c.service_name = sources.service_name;

      INSERT INTO sources (source_id, service_name, first_seen_unix_nano, last_seen_unix_nano, event_count, saw_spans, saw_logs)
      SELECT c.* FROM current_sources c
      WHERE NOT EXISTS (
        SELECT 1 FROM sources s
        WHERE s.source_id = c.source_id AND s.service_name = c.service_name
      );

      CREATE OR REPLACE TEMP TABLE current_traces AS
      SELECT trace_id,
        CASE WHEN count(DISTINCT nullif(source_id, '')) = 1 THEN max(source_id) ELSE '' END AS source_id,
        CASE WHEN count(DISTINCT nullif(session_id, '')) = 1 THEN max(session_id) ELSE '' END AS session_id,
        min(CASE WHEN time_unix_nano = 0 THEN received_unix_nano ELSE time_unix_nano END) AS first_seen_unix_nano,
        max(CASE WHEN kind = 'span' AND span_end_time_unix_nano > 0 THEN span_end_time_unix_nano ELSE time_unix_nano END) AS last_seen_unix_nano,
        CASE
          WHEN bool_or(kind = 'span' AND span_status_code = 2) THEN 3
          WHEN bool_or(kind = 'span' AND parent_span_id = '' AND span_end_time_unix_nano > 0) THEN 2
          ELSE 1
        END AS state,
        count(*) FILTER (kind = 'span') AS span_count,
        count(*) FILTER (kind = 'log') AS log_count,
        max(cursor) AS last_event_cursor
      FROM events WHERE trace_id <> '' GROUP BY trace_id;
    `)

    const deletedTraceResult = await this.connection.runAndReadAll(`
      SELECT max(cursor) AS cursor FROM traces
      WHERE trace_id NOT IN (SELECT trace_id FROM current_traces)
    `)
    const deletedTraceRows = deletedTraceResult.getRowObjectsJS()
    if (deletedTraceRows.length === 1 && deletedTraceRows[0].cursor !== null)
      await this.setPrunedWatermark('traces', requiredBigInt(deletedTraceRows[0], 'cursor'))

    await this.connection.run(`

      DELETE FROM traces WHERE trace_id NOT IN (SELECT trace_id FROM current_traces);

      UPDATE traces SET
        source_id = c.source_id,
        session_id = c.session_id,
        first_seen_unix_nano = c.first_seen_unix_nano,
        last_seen_unix_nano = c.last_seen_unix_nano,
        state = c.state,
        span_count = c.span_count,
        log_count = c.log_count,
        last_event_cursor = c.last_event_cursor
      FROM current_traces c WHERE c.trace_id = traces.trace_id;

      INSERT INTO traces (trace_id, source_id, session_id, first_seen_unix_nano, last_seen_unix_nano, state, span_count, log_count, last_event_cursor)
      SELECT c.* FROM current_traces c
      WHERE NOT EXISTS (SELECT 1 FROM traces t WHERE t.trace_id = c.trace_id);
    `)
  }

  private async storedBytes(): Promise<bigint> {
    const result = await this.connection.runAndReadAll(`
      SELECT
        (SELECT coalesce(sum(
          octet_length(encode(raw_json)) + octet_length(encode(resource_json)) +
          octet_length(encode(scope_json)) + octet_length(encode(resource_schema_url)) +
          octet_length(encode(scope_schema_url))
        ), 0) FROM events) +
        (SELECT coalesce(sum(octet_length(body)), 0) FROM ingest_batches) AS stored_bytes
    `)
    const rows = result.getRowObjectsJS()
    return rows.length === 1 ? requiredBigInt(rows[0], 'stored_bytes') : 0n
  }

  private async pruneInternal(): Promise<void> {
    await this.connection.run('BEGIN TRANSACTION')
    try {
      const cutoff = BigInt(Date.now() - this.options.retentionDays * 86_400_000) * 1_000_000n
      const expiredResult = await this.connection.runAndReadAll('SELECT max(cursor) AS cursor FROM events WHERE received_unix_nano < ?', [cutoff])
      const expiredRows = expiredResult.getRowObjectsJS()
      if (expiredRows.length === 1 && expiredRows[0].cursor !== null)
        await this.setPrunedWatermark('events', requiredBigInt(expiredRows[0], 'cursor'))
      await this.connection.run('DELETE FROM events WHERE received_unix_nano < ?', [cutoff])
      await this.connection.run('DELETE FROM ingest_batches WHERE cursor NOT IN (SELECT DISTINCT batch_cursor FROM events)')

      while (await this.storedBytes() > BigInt(this.options.maxStoredBytes)) {
        const oldestResult = await this.connection.runAndReadAll('SELECT cursor FROM events ORDER BY cursor ASC LIMIT 100')
        const oldestRows = oldestResult.getRowObjectsJS()
        if (oldestRows.length === 0)
          break
        const boundary = requiredBigInt(oldestRows.at(-1)!, 'cursor')
        await this.setPrunedWatermark('events', boundary)
        await this.connection.run('DELETE FROM events WHERE cursor <= ?', [boundary])
        await this.connection.run('DELETE FROM ingest_batches WHERE cursor NOT IN (SELECT DISTINCT batch_cursor FROM events)')
      }

      await this.rebuildSummaries()
      await this.connection.run('COMMIT')
    }
    catch (error) {
      await this.connection.run('ROLLBACK')
      throw error
    }
  }

  health(): { maintenanceError: string } {
    return { maintenanceError: this.maintenanceError }
  }

  async close(): Promise<void> {
    await this.queue
    this.reader.closeSync()
    this.connection.closeSync()
    this.instance.closeSync()
  }
}

export const storageRow = {
  bigint: requiredBigInt,
  nullableString,
  number: requiredNumber,
  string: requiredString,
}
