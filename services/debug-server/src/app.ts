import type {
  V1EventKind,
  V1EventRecord,
  V1ExportRecordsResponse,
  V1GetTraceResponse,
  V1ListEventsResponse,
  V1ListSourcesResponse,
  V1ListTracesResponse,
  V1Source,
  V1TraceState,
  V1TraceSummary,
} from '@proj-airi/stage-shared/debug'
import type { Context } from 'hono'

import type { DebugServerConfig } from './config'
import type { Signal } from './protocol'
import type { DebugStorage, StoredEvent } from './storage'

import { Buffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'
import { gunzipSync } from 'node:zlib'

import { errorMessageFromUnknown } from '@proj-airi/stage-shared/error-message'
import { Hono } from 'hono'

import { decodeOtlp, encodeOtlpResponse, encodeStatus } from './protocol'
import { CursorExpiredError, storageRow } from './storage'

class HttpError extends Error {
  constructor(
    public readonly status: 400 | 401 | 403 | 404 | 410 | 413 | 415 | 503,
    public readonly rpcCode: number,
    message: string,
  ) {
    super(message)
  }
}

function contentType(value: string | undefined): string {
  return value?.split(';', 1)[0].trim().toLowerCase() ?? 'application/json'
}

function acceptedOtlpContentType(value: string): value is 'application/json' | 'application/x-protobuf' {
  return value === 'application/json' || value === 'application/x-protobuf'
}

function authorized(header: string | undefined, token: string): boolean {
  if (!header?.startsWith('Bearer '))
    return false
  const supplied = Buffer.from(header.slice(7))
  const expected = Buffer.from(token)
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
}

function assertHost(c: Context): void {
  const rawHost = c.req.header('host') ?? ''
  const hostname = rawHost.startsWith('[')
    ? rawHost.slice(1, rawHost.indexOf(']'))
    : rawHost.split(':', 1)[0]
  if (hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '::1')
    throw new HttpError(403, 7, 'Host must resolve to the loopback interface')
}

function assertOrigin(c: Context, allowedOrigins: Set<string>): void {
  const origin = c.req.header('origin')
  if (origin !== undefined && !allowedOrigins.has(origin))
    throw new HttpError(403, 7, 'Origin is not allowed')
}

function exactUnsigned(value: string | undefined, name: string): string {
  if (value === undefined || value === '')
    return ''
  if (!/^\d+$/.test(value))
    throw new HttpError(400, 3, `${name} must be an unsigned integer`)
  const maximum = name === 'afterCursor' ? 9_223_372_036_854_775_807n : 18_446_744_073_709_551_615n
  if (BigInt(value) > maximum)
    throw new HttpError(400, 3, `${name} is outside its supported range`)
  return value
}

function pageSize(value: string | undefined, maximum: number, fallback = 50): number {
  if (value === undefined || value === '')
    return fallback
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum)
    throw new HttpError(400, 3, `pageSize must be between 1 and ${maximum}`)
  return parsed
}

function optionalId(value: string | undefined, bytes: number, name: string): string | undefined {
  if (value === undefined)
    return undefined
  if (!new RegExp(`^[0-9a-fA-F]{${bytes * 2}}$`).test(value))
    throw new HttpError(400, 3, `${name} must be ${bytes} bytes of hexadecimal text`)
  return value.toLowerCase()
}

function queryKind(value: string | undefined): Signal | undefined {
  if (value === undefined || value === 'EVENT_KIND_UNSPECIFIED')
    return undefined
  if (value === 'EVENT_KIND_SPAN')
    return 'span'
  if (value === 'EVENT_KIND_LOG')
    return 'log'
  throw new HttpError(400, 3, 'kind is not a defined EventKind value')
}

const traceStateNumbers: Record<V1TraceState, number> = {
  TRACE_STATE_UNSPECIFIED: 0,
  TRACE_STATE_INCOMPLETE: 1,
  TRACE_STATE_COMPLETE: 2,
  TRACE_STATE_ERROR: 3,
}

const traceStateNames: Record<number, V1TraceState> = {
  0: 'TRACE_STATE_UNSPECIFIED',
  1: 'TRACE_STATE_INCOMPLETE',
  2: 'TRACE_STATE_COMPLETE',
  3: 'TRACE_STATE_ERROR',
}

function queryState(value: string | undefined): number | undefined {
  if (value === undefined || value === 'TRACE_STATE_UNSPECIFIED')
    return undefined
  if (!(value in traceStateNumbers))
    throw new HttpError(400, 3, 'state is not a defined TraceState value')
  return traceStateNumbers[value as V1TraceState]
}

function eventJson(event: StoredEvent): V1EventRecord {
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

function traceJson(row: Record<string, unknown>): V1TraceSummary {
  const state = storageRow.number(row, 'state')
  const stateName = traceStateNames[state]
  if (stateName === undefined)
    throw new Error(`Unknown stored trace state ${state}`)
  return {
    firstSeenUnixNano: storageRow.bigint(row, 'first_seen_unix_nano').toString(),
    lastCursor: storageRow.bigint(row, 'last_event_cursor').toString(),
    lastSeenUnixNano: storageRow.bigint(row, 'last_seen_unix_nano').toString(),
    logCount: storageRow.bigint(row, 'log_count').toString(),
    sessionId: storageRow.string(row, 'session_id'),
    sourceId: storageRow.string(row, 'source_id'),
    spanCount: storageRow.bigint(row, 'span_count').toString(),
    state: stateName,
    traceId: storageRow.string(row, 'trace_id'),
  }
}

function sourceJson(row: Record<string, unknown>): V1Source {
  const signals: string[] = []
  if (row.saw_spans === true)
    signals.push('traces')
  if (row.saw_logs === true)
    signals.push('logs')
  return {
    eventCount: storageRow.bigint(row, 'event_count').toString(),
    firstSeenUnixNano: storageRow.bigint(row, 'first_seen_unix_nano').toString(),
    lastSeenUnixNano: storageRow.bigint(row, 'last_seen_unix_nano').toString(),
    serviceName: storageRow.string(row, 'service_name'),
    signals,
    sourceId: storageRow.string(row, 'source_id'),
  }
}

function batchKind(signal: string): V1EventKind {
  if (signal === 'span')
    return 'EVENT_KIND_SPAN'
  if (signal === 'log')
    return 'EVENT_KIND_LOG'
  throw new Error(`Unknown stored signal ${signal}`)
}

function batchBody(row: Record<string, unknown>): string {
  const value = row.body
  if (!(value instanceof Uint8Array))
    throw new Error('DuckDB column body is not binary data')
  return Buffer.from(value).toString('base64')
}

function responseBody(payload: Uint8Array | string): BodyInit {
  return typeof payload === 'string' ? payload : Uint8Array.from(payload).buffer
}

function writeEncoded(payload: Uint8Array | string, responseContentType: string, status = 200): Response {
  const headers = new Headers({ 'content-type': responseContentType })
  return new Response(responseBody(payload), { headers, status })
}

function errorResponse(c: Context, error: HttpError): Response {
  const requestType = contentType(c.req.header('content-type'))
  const responseType = acceptedOtlpContentType(requestType) && (c.req.path === '/v1/traces' || c.req.path === '/v1/logs')
    ? requestType
    : 'application/json'
  const body = encodeStatus(responseType, error.rpcCode, error.message)
  const headers = new Headers({ 'content-type': responseType })
  if (error.status === 503)
    headers.set('retry-after', '1')
  return new Response(responseBody(body), { headers, status: error.status })
}

async function readLimitedBody(request: Request, maximumBytes: number): Promise<Uint8Array> {
  if (request.body === null)
    return new Uint8Array()

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  while (true) {
    const result = await reader.read()
    if (result.done)
      break
    length += result.value.byteLength
    if (length > maximumBytes) {
      await reader.cancel()
      throw new HttpError(413, 8, 'OTLP request exceeds the configured size limit')
    }
    chunks.push(result.value)
  }

  const body = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

export function createApp(storage: DebugStorage, config: DebugServerConfig): Hono {
  const app = new Hono()
  let activeIngests = 0

  app.onError((error, c) => {
    if (error instanceof HttpError)
      return errorResponse(c, error)
    if (error instanceof CursorExpiredError)
      return errorResponse(c, new HttpError(410, 11, error.message))
    console.error('[debug-server] Request failed', error)
    return errorResponse(c, new HttpError(503, 14, 'The debug store is unavailable'))
  })

  app.get('/health', (c) => {
    assertHost(c)
    assertOrigin(c, config.allowedOrigins)
    const health = storage.health()
    return c.json({
      status: health.maintenanceError ? 'degraded' : 'ok',
    })
  })

  app.use('*', async (c, next) => {
    assertHost(c)
    assertOrigin(c, config.allowedOrigins)
    if (c.req.method === 'OPTIONS') {
      const origin = c.req.header('origin')
      if (origin)
        c.header('access-control-allow-origin', origin)
      c.header('access-control-allow-headers', 'authorization,content-type,content-encoding')
      c.header('access-control-allow-methods', 'GET,POST,OPTIONS')
      c.header('access-control-max-age', '600')
      return c.body(null, 204)
    }
    if (!authorized(c.req.header('authorization'), config.token))
      throw new HttpError(401, 16, 'A valid Bearer token is required')
    await next()
    const origin = c.req.header('origin')
    if (origin)
      c.header('access-control-allow-origin', origin)
  })

  async function ingest(c: Context, signal: Signal): Promise<Response> {
    const requestContentType = contentType(c.req.header('content-type'))
    if (!acceptedOtlpContentType(requestContentType))
      throw new HttpError(415, 3, 'Content-Type must be application/json or application/x-protobuf')

    const declaredLength = Number(c.req.header('content-length') ?? '0')
    if (Number.isFinite(declaredLength) && declaredLength > config.maxRequestBytes)
      throw new HttpError(413, 8, 'OTLP request exceeds the configured size limit')

    const originalBody = await readLimitedBody(c.req.raw, config.maxRequestBytes)
    const encoding = (c.req.header('content-encoding') ?? '').toLowerCase()
    if (encoding && encoding !== 'gzip')
      throw new HttpError(415, 3, 'Content-Encoding must be gzip or empty')

    let decodedBody: Uint8Array
    try {
      decodedBody = encoding === 'gzip'
        ? gunzipSync(originalBody, { maxOutputLength: config.maxRequestBytes })
        : originalBody
    }
    catch (error) {
      if (error instanceof Error && error.message.includes('Cannot create a Buffer larger than'))
        throw new HttpError(413, 8, 'Decompressed OTLP request exceeds the configured size limit')
      throw new HttpError(400, 3, 'OTLP gzip body is invalid')
    }
    if (decodedBody.byteLength > config.maxRequestBytes)
      throw new HttpError(413, 8, 'Decompressed OTLP request exceeds the configured size limit')

    const receivedUnixNano = (BigInt(Date.now()) * 1_000_000n).toString()
    let decoded
    try {
      decoded = decodeOtlp(signal, decodedBody, requestContentType, receivedUnixNano, {
        captureContent: config.captureContent,
      })
    }
    catch (error) {
      const message = errorMessageFromUnknown(error, 'OTLP body is invalid')
      throw new HttpError(400, 3, message)
    }

    const result = await storage.ingest({
      body: decoded.persistedBody,
      contentEncoding: '',
      contentType: requestContentType,
      receivedUnixNano,
      records: decoded.records,
      signal,
    })
    const response = encodeOtlpResponse(signal, requestContentType, result.conflicts.length, result.conflicts.join(', '))
    return writeEncoded(response, requestContentType)
  }

  async function ingestWithCapacity(c: Context, signal: Signal): Promise<Response> {
    if (activeIngests >= config.maxConcurrentIngests)
      throw new HttpError(503, 14, 'The local ingest queue is full')
    activeIngests++
    try {
      return await ingest(c, signal)
    }
    finally {
      activeIngests--
    }
  }
  app.post('/v1/traces', c => ingestWithCapacity(c, 'span'))
  app.post('/v1/logs', c => ingestWithCapacity(c, 'log'))

  app.get('/api/debug/v1/sources', async (c) => {
    const page = await storage.listSources({
      afterCursor: exactUnsigned(c.req.query('afterCursor'), 'afterCursor'),
      pageSize: pageSize(c.req.query('pageSize'), 200),
    })
    const body: V1ListSourcesResponse = {
      firstCursor: page.firstCursor,
      lastCursor: page.lastCursor,
      nextCursor: page.nextCursor,
      sources: page.sources.map(sourceJson),
    }
    return c.json(body)
  })

  app.get('/api/debug/v1/traces', async (c) => {
    const page = await storage.listTraces({
      afterCursor: exactUnsigned(c.req.query('afterCursor'), 'afterCursor'),
      pageSize: pageSize(c.req.query('pageSize'), 200),
      sessionId: c.req.query('sessionId'),
      sourceId: c.req.query('sourceId'),
      startedAfterUnixNano: exactUnsigned(c.req.query('startedAfterUnixNano'), 'startedAfterUnixNano') || undefined,
      state: queryState(c.req.query('state')),
    })
    const body: V1ListTracesResponse = { nextCursor: page.nextCursor, traces: page.traces.map(traceJson) }
    return c.json(body)
  })

  app.get('/api/debug/v1/traces/:traceId', async (c) => {
    const traceId = optionalId(c.req.param('traceId'), 16, 'traceId')
    if (traceId === undefined)
      throw new HttpError(400, 3, 'traceId is required')
    const row = await storage.getTrace(traceId)
    if (row === undefined)
      throw new HttpError(404, 5, 'Trace was not found')
    const body: V1GetTraceResponse = { trace: traceJson(row) }
    return c.json(body)
  })

  app.get('/api/debug/v1/events', async (c) => {
    const page = await storage.listEvents({
      afterCursor: exactUnsigned(c.req.query('afterCursor'), 'afterCursor'),
      kind: queryKind(c.req.query('kind')),
      pageSize: pageSize(c.req.query('pageSize'), 200),
      sessionId: c.req.query('sessionId'),
      sourceId: c.req.query('sourceId'),
      spanId: optionalId(c.req.query('spanId'), 8, 'spanId'),
      traceId: optionalId(c.req.query('traceId'), 16, 'traceId'),
    })
    const body: V1ListEventsResponse = { events: page.events.map(eventJson), nextCursor: page.nextCursor }
    return c.json(body)
  })

  app.get('/api/debug/v1/export', async (c) => {
    const page = await storage.exportRecords(
      exactUnsigned(c.req.query('afterCursor'), 'afterCursor'),
      pageSize(c.req.query('pageSize'), 1000, 200),
    )
    const body: V1ExportRecordsResponse = {
      batches: page.batches.map(row => ({
        body: batchBody(row),
        contentEncoding: storageRow.string(row, 'content_encoding'),
        contentType: storageRow.string(row, 'content_type'),
        cursor: storageRow.bigint(row, 'cursor').toString(),
        kind: batchKind(storageRow.string(row, 'signal')),
        receivedUnixNano: storageRow.bigint(row, 'received_unix_nano').toString(),
      })),
      events: page.events.map(eventJson),
      nextCursor: page.nextCursor,
      protocolVersion: 'airi.debug.v1',
    }
    return c.json(body)
  })

  app.notFound(c => errorResponse(c, new HttpError(404, 5, 'Route was not found')))
  return app
}
