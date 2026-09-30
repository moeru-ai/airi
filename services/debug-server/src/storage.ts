import type { DuckDBInstance } from '@duckdb/node-api'
import type { DuckDBDatabase } from '@duckdbfan/drizzle-duckdb'

import type { IngestRecord, Signal } from './protocol'

import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

import { DuckDBInstance as NativeDuckDBInstance } from '@duckdb/node-api'
import { drizzle, migrate } from '@duckdbfan/drizzle-duckdb'
import { useLogg } from '@guiiai/logg'
import { errorMessageFromUnknown } from '@proj-airi/stage-shared/error-message'
import { Mutex } from 'async-mutex'
import { and, asc, eq, exists, gt, gte, inArray, lt, lte, max, min, not, sql } from 'drizzle-orm'

import { events, ingestBatches, metadata, sources, traces } from './schema'

const log = useLogg('debug-server:storage').useGlobalConfig()

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

export type StoredBatch = typeof ingestBatches.$inferSelect
export type StoredSource = typeof sources.$inferSelect
export type StoredTrace = typeof traces.$inferSelect

export class CursorExpiredError extends Error {
  constructor(public readonly firstAvailableCursor: string) {
    super(`Cursor expired. First available cursor is ${firstAvailableCursor}`)
  }
}

type StorageTransaction = Parameters<Parameters<DuckDBDatabase['transaction']>[0]>[0]

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
  return 2
}

export class DebugStorage {
  private constructor(
    private readonly instance: DuckDBInstance,
    private readonly database: DuckDBDatabase,
    private readonly readDatabase: DuckDBDatabase,
    private readonly options: StorageOptions,
  ) {}

  private readonly mutex = new Mutex()
  private maintenanceError = ''

  static async open(options: StorageOptions): Promise<DebugStorage> {
    const instance = await NativeDuckDBInstance.create(options.path)
    const connection = await instance.connect()
    const reader = await instance.connect()
    // NOTICE:
    // OTLP JSON strings can use braces and must remain scalar VARCHAR values.
    // The pinned driver infers PostgreSQL arrays from string syntax without column metadata.
    // Source: patches/@duckdbfan__drizzle-duckdb@1.5.4-15.patch.
    // Remove the patch when the driver requires explicit arrays or uses column metadata.
    const storage = new DebugStorage(instance, drizzle(connection), drizzle(reader), options)
    try {
      await storage.initialize()
      await storage.pruneInternal()
      return storage
    }
    catch (error) {
      await storage.close()
      throw error
    }
  }

  private async initialize(): Promise<void> {
    const existingTables = await this.database.execute<{ table_name: string, table_schema: string }>(sql`SELECT table_schema, table_name FROM information_schema.tables`)
    const hasEvents = existingTables.some(row => row.table_schema === 'main' && row.table_name === 'events')
    const hasMigrations = existingTables.some(row => row.table_schema === 'drizzle' && row.table_name === '__drizzle_migrations')
    if (hasEvents && !hasMigrations)
      throw new Error('This debug database predates migrations. Keep the original file and set AIRI_DEBUG_DB_PATH to a new file.')
    await migrate(this.database, fileURLToPath(new URL('../drizzle', import.meta.url)))
    await this.database.insert(metadata).values([
      { key: 'events_pruned_through', value: '0' },
      { key: 'sources_pruned_through', value: '0' },
      { key: 'traces_pruned_through', value: '0' },
    ]).onConflictDoNothing()
  }

  async ingest(input: {
    body: Uint8Array
    contentEncoding: string
    contentType: string
    receivedUnixNano: string
    records: IngestRecord[]
    signal: Signal
  }): Promise<IngestResult> {
    return this.mutex.runExclusive(async () => {
      const result = await this.database.transaction(async (tx) => {
        const [batch] = await tx.insert(ingestBatches).values({
          signal: input.signal,
          contentType: input.contentType,
          contentEncoding: input.contentEncoding,
          body: Buffer.from(input.body),
          receivedUnixNano: BigInt(input.receivedUnixNano),
        }).returning({ cursor: ingestBatches.cursor })
        if (!batch)
          throw new Error('DuckDB did not return an ingest batch cursor')
        const conflicts: string[] = []
        let inserted = 0
        for (const record of input.records) {
          const key = uniqueKey(record)
          const payloadHash = hashRecord(record)
          if (key) {
            const [existing] = await tx.select({ payloadHash: events.payloadHash }).from(events).where(eq(events.uniqueKey, key))
            if (existing) {
              if (existing.payloadHash !== payloadHash)
                conflicts.push(key)
              continue
            }
          }
          const [event] = await tx.insert(events).values({
            ...record,
            batchCursor: batch.cursor,
            timeUnixNano: BigInt(record.timeUnixNano),
            receivedUnixNano: BigInt(record.receivedUnixNano),
            spanEndTimeUnixNano: BigInt(record.spanEndTimeUnixNano),
            payloadHash,
            uniqueKey: key,
          }).returning({ cursor: events.cursor })
          if (!event)
            throw new Error('DuckDB did not return an event cursor')
          inserted++
          await tx.insert(sources).values({
            sourceId: record.sourceId,
            serviceName: record.serviceName,
            firstSeenUnixNano: BigInt(record.receivedUnixNano),
            lastSeenUnixNano: BigInt(record.receivedUnixNano),
            eventCount: 1n,
            sawSpans: record.kind === 'span',
            sawLogs: record.kind === 'log',
          }).onConflictDoUpdate({
            target: [sources.sourceId, sources.serviceName],
            set: {
              firstSeenUnixNano: sql`least(${sources.firstSeenUnixNano}, excluded.first_seen_unix_nano)`,
              lastSeenUnixNano: sql`greatest(${sources.lastSeenUnixNano}, excluded.last_seen_unix_nano)`,
              eventCount: sql`${sources.eventCount} + 1`,
              sawSpans: sql`${sources.sawSpans} OR excluded.saw_spans`,
              sawLogs: sql`${sources.sawLogs} OR excluded.saw_logs`,
            },
          })
          if (record.traceId) {
            await tx.insert(traces).values({
              traceId: record.traceId,
              sourceId: record.sourceId,
              sessionId: record.sessionId,
              firstSeenUnixNano: BigInt(record.timeUnixNano),
              lastSeenUnixNano: BigInt(record.kind === 'span' ? record.spanEndTimeUnixNano : record.timeUnixNano),
              state: traceState(record),
              spanCount: record.kind === 'span' ? 1n : 0n,
              logCount: record.kind === 'log' ? 1n : 0n,
              lastEventCursor: event.cursor,
            }).onConflictDoUpdate({
              target: traces.traceId,
              set: {
                sourceId: sql`CASE WHEN excluded.source_id = '' OR ${traces.sourceId} = excluded.source_id THEN ${traces.sourceId} ELSE '' END`,
                sessionId: sql`CASE WHEN excluded.session_id = '' OR ${traces.sessionId} = excluded.session_id THEN ${traces.sessionId} ELSE '' END`,
                firstSeenUnixNano: sql`least(${traces.firstSeenUnixNano}, excluded.first_seen_unix_nano)`,
                lastSeenUnixNano: sql`greatest(${traces.lastSeenUnixNano}, excluded.last_seen_unix_nano)`,
                state: sql`greatest(${traces.state}, excluded.state)`,
                spanCount: sql`${traces.spanCount} + excluded.span_count`,
                logCount: sql`${traces.logCount} + excluded.log_count`,
                lastEventCursor: sql`greatest(${traces.lastEventCursor}, excluded.last_event_cursor)`,
              },
            })
          }
        }
        return { conflicts, inserted }
      })
      try {
        await this.pruneInternal()
        this.maintenanceError = ''
      }
      catch (error) {
        this.maintenanceError = errorMessageFromUnknown(error)
        log.withError(error).error('Retention maintenance failed after a committed ingest')
      }
      return result
    })
  }

  private async checkCursor(table: 'events' | 'sources' | 'traces', afterCursor: string): Promise<void> {
    if (!afterCursor || afterCursor === '0')
      return
    let firstCursor: bigint | null
    if (table === 'events')
      [{ firstCursor }] = await this.readDatabase.select({ firstCursor: min(events.cursor) }).from(events)
    else if (table === 'sources')
      [{ firstCursor }] = await this.readDatabase.select({ firstCursor: min(sources.cursor) }).from(sources)
    else
      [{ firstCursor }] = await this.readDatabase.select({ firstCursor: min(traces.cursor) }).from(traces)
    const [watermarkRow] = await this.readDatabase.select({ value: metadata.value }).from(metadata).where(eq(metadata.key, `${table}_pruned_through`))
    const watermark = watermarkRow ? BigInt(watermarkRow.value) : 0n
    if (BigInt(afterCursor) < watermark)
      throw new CursorExpiredError((firstCursor ?? watermark + 1n).toString())
  }

  async listEvents(query: EventQuery): Promise<{ events: StoredEvent[], nextCursor: string }> {
    await this.checkCursor('events', query.afterCursor)
    const rows = await this.readDatabase.select().from(events).where(and(
      gt(events.cursor, BigInt(query.afterCursor || '0')),
      query.traceId === undefined ? undefined : eq(events.traceId, query.traceId),
      query.spanId === undefined ? undefined : eq(events.spanId, query.spanId),
      query.sourceId === undefined ? undefined : eq(events.sourceId, query.sourceId),
      query.sessionId === undefined ? undefined : eq(events.sessionId, query.sessionId),
      query.kind === undefined ? undefined : eq(events.kind, query.kind),
    )).orderBy(asc(events.cursor)).limit(query.pageSize + 1)
    const page = rows.slice(0, query.pageSize)
    return {
      events: page.map(row => ({
        ...row,
        cursor: row.cursor.toString(),
        kind: row.kind as Signal,
        timeUnixNano: row.timeUnixNano.toString(),
        receivedUnixNano: row.receivedUnixNano.toString(),
        spanEndTimeUnixNano: row.spanEndTimeUnixNano.toString(),
      })),
      nextCursor: rows.length > query.pageSize ? page.at(-1)!.cursor.toString() : '',
    }
  }

  async listSources(query: SourceQuery) {
    await this.checkCursor('sources', query.afterCursor)
    const rows = await this.readDatabase.select().from(sources).where(gt(sources.cursor, BigInt(query.afterCursor || '0'))).orderBy(asc(sources.cursor)).limit(query.pageSize + 1)
    const page = rows.slice(0, query.pageSize)
    const [bounds] = await this.readDatabase.select({
      firstCursor: sql<bigint | null>`min(${sources.cursor})`,
      lastCursor: sql<bigint | null>`max(${sources.cursor})`,
    }).from(sources)
    return {
      firstCursor: bounds.firstCursor === null ? '' : bounds.firstCursor.toString(),
      lastCursor: bounds.lastCursor === null ? '' : bounds.lastCursor.toString(),
      nextCursor: rows.length > query.pageSize ? page.at(-1)!.cursor.toString() : '',
      sources: page,
    }
  }

  async listTraces(query: TraceQuery) {
    await this.checkCursor('traces', query.afterCursor)
    const rows = await this.readDatabase.select().from(traces).where(and(
      gt(traces.cursor, BigInt(query.afterCursor || '0')),
      query.state === undefined ? undefined : eq(traces.state, query.state),
      query.sourceId === undefined ? undefined : exists(this.readDatabase.select().from(events).where(and(eq(events.traceId, traces.traceId), eq(events.sourceId, query.sourceId)))),
      query.sessionId === undefined ? undefined : exists(this.readDatabase.select().from(events).where(and(eq(events.traceId, traces.traceId), eq(events.sessionId, query.sessionId)))),
      query.startedAfterUnixNano === undefined ? undefined : gte(traces.firstSeenUnixNano, BigInt(query.startedAfterUnixNano)),
    )).orderBy(asc(traces.cursor)).limit(query.pageSize + 1)
    const page = rows.slice(0, query.pageSize)
    return { nextCursor: rows.length > query.pageSize ? page.at(-1)!.cursor.toString() : '', traces: page }
  }

  async getTrace(traceId: string) {
    const [row] = await this.readDatabase.select().from(traces).where(eq(traces.traceId, traceId))
    return row
  }

  async exportRecords(afterCursor: string, pageSize: number) {
    const eventPage = await this.listEvents({ afterCursor, pageSize })
    if (eventPage.events.length === 0)
      return { batches: [], events: [], nextCursor: '' }
    const batches = await this.readDatabase.select().from(ingestBatches).where(inArray(
      ingestBatches.cursor,
      this.readDatabase.select({ batchCursor: events.batchCursor }).from(events).where(and(
        gt(events.cursor, BigInt(afterCursor || '0')),
        sql`${events.cursor} <= ${BigInt(eventPage.events.at(-1)!.cursor)}`,
      )),
    )).orderBy(asc(ingestBatches.cursor))
    return { batches, events: eventPage.events, nextCursor: eventPage.nextCursor }
  }

  private async setPrunedWatermark(database: StorageTransaction, table: 'events' | 'sources' | 'traces', cursor: bigint): Promise<void> {
    await database.update(metadata)
      .set({ value: sql`greatest(CAST(${metadata.value} AS BIGINT), ${cursor})::VARCHAR` })
      .where(eq(metadata.key, `${table}_pruned_through`))
  }

  private async rebuildSummaries(database: StorageTransaction): Promise<void> {
    const sourceSummaries = await database.select({
      eventCount: sql<bigint>`count(*)`,
      firstSeenUnixNano: min(events.receivedUnixNano),
      lastSeenUnixNano: max(events.receivedUnixNano),
      sawLogs: sql<boolean>`bool_or(${events.kind} = 'log')`,
      sawSpans: sql<boolean>`bool_or(${events.kind} = 'span')`,
      serviceName: events.serviceName,
      sourceId: events.sourceId,
    }).from(events).groupBy(events.sourceId, events.serviceName)
    const existingSources = await database.select().from(sources)
    const sourceKeys = new Set(sourceSummaries.map(row => `${row.sourceId}\0${row.serviceName}`))
    const deletedSources = existingSources.filter(row => !sourceKeys.has(`${row.sourceId}\0${row.serviceName}`))
    for (const deleted of deletedSources) {
      await this.setPrunedWatermark(database, 'sources', deleted.cursor)
      await database.delete(sources).where(and(eq(sources.sourceId, deleted.sourceId), eq(sources.serviceName, deleted.serviceName)))
    }
    for (const summary of sourceSummaries) {
      if (summary.firstSeenUnixNano === null || summary.lastSeenUnixNano === null)
        throw new Error('DuckDB returned an empty source summary')
      const values = {
        eventCount: summary.eventCount,
        firstSeenUnixNano: summary.firstSeenUnixNano,
        lastSeenUnixNano: summary.lastSeenUnixNano,
        sawLogs: summary.sawLogs,
        sawSpans: summary.sawSpans,
        serviceName: summary.serviceName,
        sourceId: summary.sourceId,
      }
      await database.insert(sources).values(values).onConflictDoUpdate({
        target: [sources.sourceId, sources.serviceName],
        set: values,
      })
    }

    const traceSummaries = await database.select({
      firstSeenUnixNano: sql<bigint>`min(CASE WHEN ${events.timeUnixNano} = 0 THEN ${events.receivedUnixNano} ELSE ${events.timeUnixNano} END)`,
      lastEventCursor: max(events.cursor),
      lastSeenUnixNano: sql<bigint>`max(CASE WHEN ${events.kind} = 'span' AND ${events.spanEndTimeUnixNano} > 0 THEN ${events.spanEndTimeUnixNano} ELSE ${events.timeUnixNano} END)`,
      logCount: sql<bigint>`count(*) FILTER (WHERE ${events.kind} = 'log')`,
      sessionId: sql<string>`CASE WHEN count(DISTINCT nullif(${events.sessionId}, '')) = 1 THEN max(${events.sessionId}) ELSE '' END`,
      sourceId: sql<string>`CASE WHEN count(DISTINCT nullif(${events.sourceId}, '')) = 1 THEN max(${events.sourceId}) ELSE '' END`,
      spanCount: sql<bigint>`count(*) FILTER (WHERE ${events.kind} = 'span')`,
      state: sql<number>`CASE WHEN bool_or(${events.kind} = 'span' AND ${events.spanStatusCode} = 2) THEN 3 WHEN bool_or(${events.kind} = 'span' AND ${events.parentSpanId} = '' AND ${events.spanEndTimeUnixNano} > 0) THEN 2 ELSE 1 END`,
      traceId: events.traceId,
    }).from(events).where(sql`${events.traceId} <> ''`).groupBy(events.traceId)
    const existingTraces = await database.select().from(traces)
    const traceIds = new Set(traceSummaries.map(row => row.traceId))
    const deletedTraces = existingTraces.filter(row => !traceIds.has(row.traceId))
    for (const deleted of deletedTraces) {
      await this.setPrunedWatermark(database, 'traces', deleted.cursor)
      await database.delete(traces).where(eq(traces.traceId, deleted.traceId))
    }
    for (const summary of traceSummaries) {
      if (summary.firstSeenUnixNano === null || summary.lastEventCursor === null)
        throw new Error('DuckDB returned an empty trace summary')
      const values = {
        firstSeenUnixNano: summary.firstSeenUnixNano,
        lastEventCursor: summary.lastEventCursor,
        lastSeenUnixNano: summary.lastSeenUnixNano,
        logCount: summary.logCount,
        sessionId: summary.sessionId,
        sourceId: summary.sourceId,
        spanCount: summary.spanCount,
        state: summary.state,
        traceId: summary.traceId,
      }
      await database.insert(traces).values(values).onConflictDoUpdate({
        target: traces.traceId,
        set: values,
      })
    }
  }

  private async storedBytes(database: StorageTransaction): Promise<bigint> {
    const [eventBytes] = await database.select({
      value: sql<bigint>`coalesce(sum(octet_length(encode(${events.rawJson})) + octet_length(encode(${events.resourceJson})) + octet_length(encode(${events.scopeJson})) + octet_length(encode(${events.resourceSchemaUrl})) + octet_length(encode(${events.scopeSchemaUrl}))), 0)`,
    }).from(events)
    const [batchBytes] = await database.select({ value: sql<bigint>`coalesce(sum(octet_length(${ingestBatches.body})), 0)` }).from(ingestBatches)
    return eventBytes.value + batchBytes.value
  }

  private async deleteEmptyBatches(database: StorageTransaction): Promise<void> {
    await database.delete(ingestBatches).where(not(exists(
      database.select({ value: sql`1` }).from(events).where(eq(events.batchCursor, ingestBatches.cursor)),
    )))
  }

  private async pruneInternal(): Promise<void> {
    await this.database.transaction(async (transaction) => {
      const cutoff = BigInt(Date.now() - this.options.retentionDays * 86_400_000) * 1_000_000n
      const [expired] = await transaction.select({ cursor: max(events.cursor) }).from(events).where(lt(events.receivedUnixNano, cutoff))
      if (expired.cursor !== null)
        await this.setPrunedWatermark(transaction, 'events', expired.cursor)
      await transaction.delete(events).where(lt(events.receivedUnixNano, cutoff))
      await this.deleteEmptyBatches(transaction)

      while (await this.storedBytes(transaction) > BigInt(this.options.maxStoredBytes)) {
        const oldest = await transaction.select({ cursor: events.cursor }).from(events).orderBy(asc(events.cursor)).limit(100)
        if (oldest.length === 0)
          break
        const boundary = oldest.at(-1)!.cursor
        await this.setPrunedWatermark(transaction, 'events', boundary)
        await transaction.delete(events).where(lte(events.cursor, boundary))
        await this.deleteEmptyBatches(transaction)
      }

      await this.rebuildSummaries(transaction)
    })
  }

  health(): { maintenanceError: string } {
    return { maintenanceError: this.maintenanceError }
  }

  async close(): Promise<void> {
    await this.mutex.waitForUnlock()
    await this.readDatabase.close()
    await this.database.close()
    this.instance.closeSync()
  }
}
