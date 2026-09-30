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
import type { DebugStorage, StoredEvent, StoredSource, StoredTrace } from './storage'

import { Buffer } from 'node:buffer'
import { gunzipSync } from 'node:zlib'

import { useLogg } from '@guiiai/logg'
import { errorMessageFromUnknown } from '@proj-airi/stage-shared/error-message'
import { Hono } from 'hono'
import { bearerAuth } from 'hono/bearer-auth'
import { HTTPException } from 'hono/http-exception'
import { validator } from 'hono/validator'
import { isValiError, parse } from 'valibot'

import { decodeOtlp, encodeOtlpResponse, encodeStatus } from './protocol'
import { eventQuery, exportQuery, sourceQuery, traceParams, traceQuery } from './query'
import { CursorExpiredError } from './storage'

const log = useLogg('debug-server:http').useGlobalConfig()

function contentType(value: string | undefined): string {
  return value?.split(';', 1)[0].trim().toLowerCase() ?? 'application/json'
}

function acceptedOtlpContentType(value: string): value is 'application/json' | 'application/x-protobuf' {
  return value === 'application/json' || value === 'application/x-protobuf'
}

function assertHost(c: Context): void {
  const rawHost = c.req.header('host') ?? ''
  const hostname = rawHost.startsWith('[')
    ? rawHost.slice(1, rawHost.indexOf(']'))
    : rawHost.split(':', 1)[0]
  if (hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '::1')
    throw new HTTPException(403, { message: 'Host must resolve to the loopback interface' })
}

function assertOrigin(c: Context, allowedOrigins: Set<string>): void {
  const origin = c.req.header('origin')
  if (origin !== undefined && !allowedOrigins.has(origin))
    throw new HTTPException(403, { message: 'Origin is not allowed' })
}

const traceStateNames: Record<number, V1TraceState> = {
  0: 'TRACE_STATE_UNSPECIFIED',
  1: 'TRACE_STATE_INCOMPLETE',
  2: 'TRACE_STATE_COMPLETE',
  3: 'TRACE_STATE_ERROR',
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

function traceJson(row: StoredTrace): V1TraceSummary {
  const stateName = traceStateNames[row.state]
  if (stateName === undefined)
    throw new Error(`Unknown stored trace state ${row.state}`)
  return {
    firstSeenUnixNano: row.firstSeenUnixNano.toString(),
    lastCursor: row.lastEventCursor.toString(),
    lastSeenUnixNano: row.lastSeenUnixNano.toString(),
    logCount: row.logCount.toString(),
    sessionId: row.sessionId,
    sourceId: row.sourceId,
    spanCount: row.spanCount.toString(),
    state: stateName,
    traceId: row.traceId,
  }
}

function sourceJson(row: StoredSource): V1Source {
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

function batchKind(signal: string): V1EventKind {
  if (signal === 'span')
    return 'EVENT_KIND_SPAN'
  if (signal === 'log')
    return 'EVENT_KIND_LOG'
  throw new Error(`Unknown stored signal ${signal}`)
}
function responseBody(payload: Uint8Array | string): BodyInit {
  return typeof payload === 'string' ? payload : Uint8Array.from(payload).buffer
}

function writeEncoded(payload: Uint8Array | string, responseContentType: string, status = 200): Response {
  const headers = new Headers({ 'content-type': responseContentType })
  return new Response(responseBody(payload), { headers, status })
}

async function errorResponse(c: Context, error: HTTPException): Promise<Response> {
  const requestType = contentType(c.req.header('content-type'))
  const responseType = acceptedOtlpContentType(requestType) && (c.req.path === '/v1/traces' || c.req.path === '/v1/logs')
    ? requestType
    : 'application/json'
  const rpcCodes: Record<number, number> = { 400: 3, 401: 16, 403: 7, 404: 5, 410: 11, 413: 8, 415: 3, 503: 14 }
  const body = encodeStatus(responseType, rpcCodes[error.status] ?? 13, error.message || await error.getResponse().text())
  const headers = new Headers(error.res?.headers)
  headers.set('content-type', responseType)
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
      throw new HTTPException(413, { message: 'OTLP request exceeds the configured size limit' })
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
    if (error instanceof HTTPException)
      return errorResponse(c, error)
    if (isValiError(error))
      return errorResponse(c, new HTTPException(400, { message: error.message }))
    if (error instanceof CursorExpiredError)
      return errorResponse(c, new HTTPException(410, { message: error.message }))
    log.withError(error).error('Request failed')
    return errorResponse(c, new HTTPException(503, { message: 'The debug store is unavailable' }))
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
    await next()
    const origin = c.req.header('origin')
    if (origin)
      c.header('access-control-allow-origin', origin)
  })

  app.use('*', bearerAuth({ token: config.token }))

  async function ingest(c: Context, signal: Signal): Promise<Response> {
    const requestContentType = contentType(c.req.header('content-type'))
    if (!acceptedOtlpContentType(requestContentType))
      throw new HTTPException(415, { message: 'Content-Type must be application/json or application/x-protobuf' })

    const declaredLength = Number(c.req.header('content-length') ?? '0')
    if (Number.isFinite(declaredLength) && declaredLength > config.maxRequestBytes)
      throw new HTTPException(413, { message: 'OTLP request exceeds the configured size limit' })

    const originalBody = await readLimitedBody(c.req.raw, config.maxRequestBytes)
    const encoding = (c.req.header('content-encoding') ?? '').toLowerCase()
    if (encoding && encoding !== 'gzip')
      throw new HTTPException(415, { message: 'Content-Encoding must be gzip or empty' })

    let decodedBody: Uint8Array
    try {
      decodedBody = encoding === 'gzip'
        ? gunzipSync(originalBody, { maxOutputLength: config.maxRequestBytes })
        : originalBody
    }
    catch (error) {
      if (error instanceof Error && error.message.includes('Cannot create a Buffer larger than'))
        throw new HTTPException(413, { message: 'Decompressed OTLP request exceeds the configured size limit' })
      throw new HTTPException(400, { message: 'OTLP gzip body is invalid' })
    }
    if (decodedBody.byteLength > config.maxRequestBytes)
      throw new HTTPException(413, { message: 'Decompressed OTLP request exceeds the configured size limit' })

    const receivedUnixNano = (BigInt(Date.now()) * 1_000_000n).toString()
    let decoded
    try {
      decoded = decodeOtlp(signal, decodedBody, requestContentType, receivedUnixNano)
    }
    catch (error) {
      const message = errorMessageFromUnknown(error, 'OTLP body is invalid')
      throw new HTTPException(400, { message })
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
      throw new HTTPException(503, { message: 'The local ingest queue is full' })
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

  app.get('/api/debug/v1/sources', validator('query', value => parse(sourceQuery, value)), async (c) => {
    const page = await storage.listSources(c.req.valid('query'))
    const body: V1ListSourcesResponse = {
      firstCursor: page.firstCursor,
      lastCursor: page.lastCursor,
      nextCursor: page.nextCursor,
      sources: page.sources.map(sourceJson),
    }
    return c.json(body)
  })

  app.get('/api/debug/v1/traces', validator('query', value => parse(traceQuery, value)), async (c) => {
    const page = await storage.listTraces(c.req.valid('query'))
    const body: V1ListTracesResponse = { nextCursor: page.nextCursor, traces: page.traces.map(traceJson) }
    return c.json(body)
  })

  app.get('/api/debug/v1/traces/:traceId', validator('param', value => parse(traceParams, value)), async (c) => {
    const row = await storage.getTrace(c.req.valid('param').traceId)
    if (row === undefined)
      throw new HTTPException(404, { message: 'Trace was not found' })
    const body: V1GetTraceResponse = { trace: traceJson(row) }
    return c.json(body)
  })

  app.get('/api/debug/v1/events', validator('query', value => parse(eventQuery, value)), async (c) => {
    const page = await storage.listEvents(c.req.valid('query'))
    const body: V1ListEventsResponse = { events: page.events.map(eventJson), nextCursor: page.nextCursor }
    return c.json(body)
  })

  app.get('/api/debug/v1/export', validator('query', value => parse(exportQuery, value)), async (c) => {
    const query = c.req.valid('query')
    const page = await storage.exportRecords(query.afterCursor, query.pageSize)
    const body: V1ExportRecordsResponse = {
      batches: page.batches.map(row => ({
        body: Buffer.from(row.body).toString('base64'),
        contentEncoding: row.contentEncoding,
        contentType: row.contentType,
        cursor: row.cursor.toString(),
        kind: batchKind(row.signal),
        receivedUnixNano: row.receivedUnixNano.toString(),
      })),
      events: page.events.map(eventJson),
      nextCursor: page.nextCursor,
      protocolVersion: 'airi.debug.v1',
    }
    return c.json(body)
  })

  app.notFound(c => errorResponse(c, new HTTPException(404, { message: 'Route was not found' })))
  return app
}
