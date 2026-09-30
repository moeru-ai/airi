import type {
  V1ExportRecordsResponse,
  V1GetTraceResponse,
  V1ListEventsResponse,
  V1ListSourcesResponse,
  V1ListTracesResponse,
} from '@proj-airi/stage-shared/debug'
import type { Context } from 'hono'

import type { DebugServerConfig } from './config'
import type { Signal } from './protocol'
import type { DebugStorage } from './storage'

import { gunzipSync } from 'node:zlib'

import { useLogg } from '@guiiai/logg'
import { errorMessageFromUnknown } from '@proj-airi/stage-shared/error-message'
import { Hono } from 'hono'
import { bearerAuth } from 'hono/bearer-auth'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { validator } from 'hono/validator'
import { isValiError, parse } from 'valibot'

import { toEventRecord, toExportBatch, toSource, toTraceSummary } from './debug-api'
import { otlpContentType, otlpErrorResponse } from './otlp-http'
import { decodeOtlp, encodeOtlpResponse } from './protocol'
import { eventQuery, exportQuery, sourceQuery, traceParams, traceQuery } from './query'
import { CursorExpiredError } from './storage'

const log = useLogg('debug-server:http').useGlobalConfig()

function decompress(body: Uint8Array, contentEncoding: string, maximumBytes: number): Uint8Array {
  if (contentEncoding === '')
    return body
  if (contentEncoding !== 'gzip')
    throw new HTTPException(415, { message: 'Content-Encoding must be gzip or empty' })
  try {
    return gunzipSync(body, { maxOutputLength: maximumBytes })
  }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ERR_BUFFER_TOO_LARGE')
      throw new HTTPException(413, { message: 'Decompressed OTLP request exceeds the configured size limit' })
    throw new HTTPException(400, { message: 'OTLP gzip body is invalid' })
  }
}

export function createApp(storage: DebugStorage, config: DebugServerConfig): Hono {
  const app = new Hono()
  let activeIngests = 0

  app.onError((error, c) => {
    if (error instanceof HTTPException)
      return otlpErrorResponse(c, error)
    if (isValiError(error))
      return otlpErrorResponse(c, new HTTPException(400, { message: error.message }))
    if (error instanceof CursorExpiredError)
      return otlpErrorResponse(c, new HTTPException(410, { message: error.message }))
    log.withError(error).error('Request failed')
    return otlpErrorResponse(c, new HTTPException(503, { message: 'The debug store is unavailable' }))
  })

  app.use('*', cors({
    allowHeaders: ['authorization', 'content-type', 'content-encoding'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    maxAge: 600,
    origin: [...config.allowedOrigins],
  }))

  app.get('/health', (c) => {
    const health = storage.health()
    return c.json({ status: health.maintenanceError ? 'degraded' : 'ok' })
  })

  app.use('*', bearerAuth({ token: config.token }))
  app.use('/v1/*', async (_c, next) => {
    if (activeIngests >= config.maxConcurrentIngests)
      throw new HTTPException(503, { message: 'The local ingest queue is full' })
    activeIngests++
    try {
      await next()
    }
    finally {
      activeIngests--
    }
  })
  app.use('/v1/*', bodyLimit({
    maxSize: config.maxRequestBytes,
    onError: () => {
      throw new HTTPException(413, { message: 'OTLP request exceeds the configured size limit' })
    },
  }))

  async function ingest(c: Context, signal: Signal): Promise<Response> {
    const requestContentType = otlpContentType(c.req.header('content-type'))
    if (requestContentType === undefined)
      throw new HTTPException(415, { message: 'Content-Type must be application/json or application/x-protobuf' })

    const originalBody = new Uint8Array(await c.req.arrayBuffer())
    const decodedBody = decompress(originalBody, (c.req.header('content-encoding') ?? '').trim().toLowerCase(), config.maxRequestBytes)
    if (decodedBody.byteLength > config.maxRequestBytes)
      throw new HTTPException(413, { message: 'Decompressed OTLP request exceeds the configured size limit' })

    const receivedUnixNano = (BigInt(Date.now()) * 1_000_000n).toString()
    let decoded
    try {
      decoded = decodeOtlp(signal, decodedBody, requestContentType, receivedUnixNano)
    }
    catch (error) {
      throw new HTTPException(400, { message: errorMessageFromUnknown(error, 'OTLP body is invalid') })
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
    return c.body(response, 200, { 'content-type': requestContentType })
  }

  app.post('/v1/traces', c => ingest(c, 'span'))
  app.post('/v1/logs', c => ingest(c, 'log'))

  app.get('/api/debug/v1/sources', validator('query', value => parse(sourceQuery, value)), async (c) => {
    const page = await storage.listSources(c.req.valid('query'))
    const body: V1ListSourcesResponse = {
      firstCursor: page.firstCursor,
      lastCursor: page.lastCursor,
      nextCursor: page.nextCursor,
      sources: page.sources.map(toSource),
    }
    return c.json(body)
  })

  app.get('/api/debug/v1/traces', validator('query', value => parse(traceQuery, value)), async (c) => {
    const page = await storage.listTraces(c.req.valid('query'))
    const body: V1ListTracesResponse = { nextCursor: page.nextCursor, traces: page.traces.map(toTraceSummary) }
    return c.json(body)
  })

  app.get('/api/debug/v1/traces/:traceId', validator('param', value => parse(traceParams, value)), async (c) => {
    const row = await storage.getTrace(c.req.valid('param').traceId)
    if (row === undefined)
      throw new HTTPException(404, { message: 'Trace was not found' })
    const body: V1GetTraceResponse = { trace: toTraceSummary(row) }
    return c.json(body)
  })

  app.get('/api/debug/v1/events', validator('query', value => parse(eventQuery, value)), async (c) => {
    const page = await storage.listEvents(c.req.valid('query'))
    const body: V1ListEventsResponse = { events: page.events.map(toEventRecord), nextCursor: page.nextCursor }
    return c.json(body)
  })

  app.get('/api/debug/v1/export', validator('query', value => parse(exportQuery, value)), async (c) => {
    const query = c.req.valid('query')
    const page = await storage.exportRecords(query.afterCursor, query.pageSize)
    const body: V1ExportRecordsResponse = {
      batches: page.batches.map(toExportBatch),
      events: page.events.map(toEventRecord),
      nextCursor: page.nextCursor,
      protocolVersion: 'airi.debug.v1',
    }
    return c.json(body)
  })

  app.notFound(c => otlpErrorResponse(c, new HTTPException(404, { message: 'Route was not found' })))
  return app
}
