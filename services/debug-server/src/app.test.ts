import type { DebugServerConfig } from './config'

import { Buffer } from 'node:buffer'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

import { afterEach, describe, expect, it } from 'vitest'

import { createApp } from './app'
import { DebugStorage } from './storage'

const token = 'test-token'
const traceId = 'ABCDEF0123456789ABCDEF0123456789'
const spanId = 'ABCDEF0123456789'
const cleanups: Array<() => Promise<void>> = []

function config(databasePath: string, overrides: Partial<DebugServerConfig> = {}): DebugServerConfig {
  return {
    allowedOrigins: new Set(['http://localhost:5173']),
    databasePath,
    host: '127.0.0.1',
    maxRequestBytes: 1024 * 1024,
    maxConcurrentIngests: 8,
    maxStoredBytes: 1024 * 1024,
    port: 6122,
    retentionDays: 7,
    token,
    tokenGenerated: false,
    ...overrides,
  }
}

async function setup(overrides: Partial<DebugServerConfig> = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'airi-debug-test-'))
  const databasePath = join(directory, 'debug.duckdb')
  const appConfig = config(databasePath, overrides)
  const storage = await DebugStorage.open({
    maxStoredBytes: appConfig.maxStoredBytes,
    path: databasePath,
    retentionDays: appConfig.retentionDays,
  })
  cleanups.push(async () => {
    await storage.close()
    await rm(directory, { force: true, recursive: true })
  })
  return { app: createApp(storage, appConfig), storage }
}

function requestHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'authorization': `Bearer ${token}`,
    'content-type': 'application/json',
    'host': 'localhost:6122',
    ...extra,
  }
}

function logRequest(logRecord: Record<string, unknown>, resourceAttributes: unknown[] = []) {
  return {
    resourceLogs: [{
      resource: { attributes: resourceAttributes },
      schemaUrl: 'resource-schema',
      scopeLogs: [{
        logRecords: [logRecord],
        schemaUrl: 'scope-schema',
        scope: { name: 'test-scope' },
      }],
    }],
  }
}

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(cleanup => cleanup()))
})

describe('debug server OTLP ingestion', () => {
  it.each([
    '/events?afterCursor=not-a-number',
    '/events?afterCursor=9223372036854775808',
    '/events?pageSize=1.5',
    '/events?pageSize=201',
    '/events?kind=unknown',
    '/events?traceId=invalid',
    '/events?spanId=invalid',
    '/traces?state=toString',
    '/traces?startedAfterUnixNano=18446744073709551616',
    '/traces?startedAfterUnixNano=invalid',
    '/traces/invalid',
    '/export?pageSize=1001',
  ])('rejects invalid query parameters with an OTLP error: %s', async (route) => {
    const { app } = await setup()
    const response = await app.request(`/api/debug/v1${route}`, { headers: requestHeaders() })
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ code: 3 })
  })

  it('rejects missing span identities and conflicting AnyValue variants', async () => {
    const { app } = await setup()
    for (const [route, payload] of [
      ['/v1/traces', { resourceSpans: [{ scopeSpans: [{ spans: [{ name: 'invalid' }] }] }] }],
      ['/v1/logs', logRequest({ body: { stringValue: 'invalid', intValue: '1' } })],
    ] as const) {
      const response = await app.request(route, { method: 'POST', headers: requestHeaders(), body: JSON.stringify(payload) })
      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toMatchObject({ code: 3 })
    }
  })

  it('rejects excess ingest requests before consuming their bodies', async () => {
    const { app } = await setup({ maxConcurrentIngests: 1 })
    let finishBody: (() => void) | undefined
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"resourceLogs":'))
        finishBody = () => {
          controller.enqueue(new TextEncoder().encode('[]}'))
          controller.close()
        }
      },
    })
    const requestInit = {
      method: 'POST',
      headers: requestHeaders(),
      body,
      duplex: 'half',
    }
    const pending = app.request(new Request('http://localhost/v1/logs', requestInit))
    await new Promise(resolve => setTimeout(resolve, 20))
    const rejected = await app.request('/v1/logs', { method: 'POST', headers: requestHeaders(), body: '{}' })
    finishBody?.()
    expect(rejected.status).toBe(503)
    expect(rejected.headers.get('retry-after')).toBe('1')
    expect((await pending).status).toBe(200)
  })

  it('accepts gzip JSON logs before spans without losing 64-bit precision', async () => {
    const { app } = await setup()
    const payload = logRequest({
      body: { kvlistValue: { values: [{ key: 'nested', value: { intValue: '9007199254740993' } }] } },
      severityNumber: 9,
      spanId,
      timeUnixNano: '1790670000123456789',
      traceId,
      unknownFutureField: { traceId: 'not-an-otlp-id' },
    })
    const body = JSON.stringify(payload)
      .replace('"1790670000123456789"', '1790670000123456789')
      .replace('"9007199254740993"', '9007199254740993')
    const response = await app.request('/v1/logs', {
      body: gzipSync(body),
      headers: requestHeaders({ 'content-encoding': 'gzip' }),
      method: 'POST',
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(await response.json()).toEqual({})

    const eventsResponse = await app.request(`/api/debug/v1/events?traceId=${traceId.toLowerCase()}`, { headers: requestHeaders() })
    const events = await eventsResponse.json() as { events: Array<Record<string, unknown>> }
    expect(events.events).toHaveLength(1)
    expect(JSON.stringify(events)).toContain('1790670000123456789')
    expect(JSON.stringify(events)).toContain('9007199254740993')

    const tracesResponse = await app.request('/api/debug/v1/traces', { headers: requestHeaders() })
    const traces = await tracesResponse.json() as { traces: Array<{ state: string }> }
    expect(traces.traces[0]?.state).toBe('TRACE_STATE_INCOMPLETE')
  })

  it('rejects signed AnyValue overflow before protobuf conversion', async () => {
    const { app } = await setup()
    const payload = logRequest({
      attributes: [{ key: 'overflow', value: { intValue: '9223372036854775808' } }],
      severityNumber: 9,
      timeUnixNano: '1790670000123456789',
    })
    const response = await app.request('/v1/logs', {
      body: JSON.stringify(payload),
      headers: requestHeaders(),
      method: 'POST',
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ code: 3 })
  })

  it('preserves received content and attributes in events and batches', async () => {
    const { app } = await setup()
    const payload = logRequest({
      attributes: [
        { key: 'message.content', value: { stringValue: 'private content' } },
        { key: 'safe.count', value: { intValue: '2' } },
      ],
      body: { stringValue: 'private body' },
      severityNumber: 9,
      timeUnixNano: '1790670000123456789',
    }, [
      { key: 'service.name', value: { stringValue: 'airi-test' } },
      { key: 'api_key', value: { stringValue: 'private credential' } },
    ])
    const response = await app.request('/v1/logs', {
      body: JSON.stringify(payload),
      headers: requestHeaders(),
      method: 'POST',
    })
    expect(response.status).toBe(200)

    const exportResponse = await app.request('/api/debug/v1/export', { headers: requestHeaders() })
    const exportBody = await exportResponse.json() as { batches: Array<{ body: string, contentType: string }> }
    const batchBodies = exportBody.batches.map(batch => Buffer.from(batch.body, 'base64').toString('utf8')).join('\n')
    const exported = JSON.stringify(exportBody)
    expect(exported).toContain('safe.count')
    expect(exported).toContain('private content')
    expect(exported).toContain('private body')
    expect(exported).toContain('private credential')
    expect(batchBodies).toContain('private content')
    expect(batchBodies).toContain('private body')
    expect(batchBodies).toContain('private credential')
  })

  it('preserves URL parameters and authorization attributes without rewriting', async () => {
    const { app } = await setup()
    const payload = logRequest({
      attributes: [
        { key: 'safe.url', value: { stringValue: 'https://example.com/file?X-Amz-Signature=secret-signature&part=1' } },
        { key: 'authorization', value: { stringValue: 'Bearer secret-token' } },
      ],
      body: { stringValue: 'received body' },
      severityNumber: 9,
      timeUnixNano: '1790670000123456789',
    })
    const response = await app.request('/v1/logs', {
      body: JSON.stringify(payload),
      headers: requestHeaders(),
      method: 'POST',
    })
    expect(response.status).toBe(200)

    const exportResponse = await app.request('/api/debug/v1/export', { headers: requestHeaders() })
    const exportBody = await exportResponse.json() as { batches: Array<{ body: string }> }
    const decodedBatch = Buffer.from(exportBody.batches[0]!.body, 'base64').toString('utf8')
    expect(decodedBatch).toBe(JSON.stringify(payload))
    expect(decodedBatch).toContain('received body')
    expect(decodedBatch).toContain('secret-signature')
    expect(decodedBatch).toContain('secret-token')
  })

  it('enforces the decompressed request limit during gunzip', async () => {
    const { app } = await setup({ maxRequestBytes: 256 })
    const compressed = gzipSync(JSON.stringify({ resourceLogs: [], padding: 'a'.repeat(2048) }))
    expect(compressed.byteLength).toBeLessThan(256)

    const response = await app.request('/v1/logs', {
      body: compressed,
      headers: requestHeaders({ 'content-encoding': 'gzip' }),
      method: 'POST',
    })
    expect(response.status).toBe(413)
    await expect(response.json()).resolves.toMatchObject({ code: 8 })
  })

  it('requires the configured token and allowed browser origin', async () => {
    const { app } = await setup()
    const unauthorized = await app.request('/api/debug/v1/events', { headers: { host: 'localhost' } })
    expect(unauthorized.status).toBe(401)
    expect(unauthorized.headers.get('www-authenticate')).toContain('Bearer')
    await expect(unauthorized.json()).resolves.toMatchObject({ code: 16 })

    const wrongToken = await app.request('/api/debug/v1/events', {
      headers: requestHeaders({ authorization: 'Bearer wrong-token' }),
    })
    expect(wrongToken.status).toBe(401)
    await expect(wrongToken.json()).resolves.toMatchObject({ code: 16 })

    const forbidden = await app.request('/api/debug/v1/events', {
      headers: requestHeaders({ origin: 'https://example.com' }),
    })
    expect(forbidden.status).toBe(403)
  })
})
