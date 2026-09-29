import type { ChildProcess } from 'node:child_process'

import process from 'node:process'

import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { context, trace } from '@opentelemetry/api'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { LoggerProvider, SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs'
import { BasicTracerProvider, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { debugExportRecords, debugGetTrace, debugListEvents } from '@proj-airi/stage-shared/debug'
import { expect, it } from 'vitest'

async function unusedPort(): Promise<number> {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (address === null || typeof address === 'string')
    throw new Error('Expected a local TCP address')
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  return address.port
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null)
    return
  const exited = once(child, 'exit')
  child.kill('SIGTERM')
  await exited
}

it('runs the CLI, observes logs during a 30-second span, and recovers committed records after restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'airi-otlp-e2e-'))
  const port = await unusedPort()
  const baseUrl = `http://127.0.0.1:${port}`
  const headers = { Authorization: 'Bearer integration-test-only' }
  const options = { baseUrl, headers, throwOnError: true as const }
  let output = ''
  let child: ChildProcess | undefined
  async function start(): Promise<void> {
    child = spawn(process.execPath, [fileURLToPath(import.meta.resolve('tsx/cli')), 'src/bin.ts'], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      env: {
        ...process.env,
        AIRI_DEBUG_PORT: String(port),
        AIRI_DEBUG_TOKEN: 'integration-test-only',
        AIRI_DEBUG_DB_PATH: join(directory, 'events.duckdb'),
        AIRI_DEBUG_CAPTURE_CONTENT: 'true',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout?.on('data', (chunk) => {
      output += String(chunk)
    })
    child.stderr?.on('data', (chunk) => {
      output += String(chunk)
    })
    await expect.poll(async () => {
      if (child?.exitCode !== null)
        throw new Error(output)
      try {
        return (await fetch(`${baseUrl}/health`)).status
      }
      catch {
        return 0
      }
    }, { timeout: 15_000 }).toBe(200)
  }
  const resource = resourceFromAttributes({ 'service.name': 'real-sdk-test', 'service.instance.id': 'sdk-instance' })
  const tracerProvider = new BasicTracerProvider({
    resource,
    spanProcessors: [new SimpleSpanProcessor(new OTLPTraceExporter({ url: `${baseUrl}/v1/traces`, headers }))],
  })
  const loggerProvider = new LoggerProvider({
    resource,
    processors: [new SimpleLogRecordProcessor({ exporter: new OTLPLogExporter({ url: `${baseUrl}/v1/logs`, headers }) })],
  })
  try {
    await start()
    const started = performance.now()
    const span = tracerProvider.getTracer('test-tracer').startSpan('agent.long-running')
    const traceId = span.spanContext().traceId
    const logger = loggerProvider.getLogger('test-logger')
    const latencies: number[] = []
    for (let index = 0; index < 5; index++) {
      const emitted = performance.now()
      logger.emit({
        context: trace.setSpan(context.active(), span),
        severityNumber: 9,
        body: { tool: 'future-tool', result: { step: index, values: ['result', 42] } },
        attributes: { 'event_id': `step-${index}`, 'event.name': 'future.agent.progress', 'session_id': 'test-session' },
      })
      await loggerProvider.forceFlush()
      await expect.poll(async () => {
        const page = await debugListEvents({ ...options, query: { traceId } })
        return page.data?.events?.length
      }, { timeout: 5000, interval: 10 }).toBe(index + 1)
      const response = await debugListEvents({ ...options, query: { traceId } })
      expect(response.data?.events).toHaveLength(index + 1)
      expect(response.data?.events?.every(event => event.log && !event.span)).toBe(true)
      latencies.push(performance.now() - emitted)
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    const beforeEnd = await debugGetTrace({ ...options, path: { traceId } })
    expect(beforeEnd.data?.trace?.state).toBe('TRACE_STATE_INCOMPLETE')
    expect(beforeEnd.data?.trace?.logCount).toBe('5')
    while (performance.now() - started < 30_000)
      await new Promise(resolve => setTimeout(resolve, Math.ceil(30_000 - (performance.now() - started))))
    expect(performance.now() - started).toBeGreaterThanOrEqual(30_000)
    span.end()
    await tracerProvider.forceFlush()
    const completed = await debugGetTrace({ ...options, path: { traceId } })
    expect(completed.data?.trace).toMatchObject({ state: 'TRACE_STATE_COMPLETE', spanCount: '1', logCount: '5' })
    const firstPage = await debugListEvents({ ...options, query: { traceId, pageSize: 2 } })
    expect(firstPage.data?.events).toHaveLength(2)
    const secondPage = await debugListEvents({ ...options, query: { traceId, pageSize: 2, afterCursor: firstPage.data?.nextCursor } })
    expect(secondPage.data?.events).toHaveLength(2)
    expect(secondPage.data?.events?.[0].cursor).not.toBe(firstPage.data?.events?.[0].cursor)
    const exported = await debugExportRecords(options)
    expect(exported.data?.batches?.length).toBeGreaterThan(0)
    const batch = exported.data?.batches?.find(item => item.kind === 'EVENT_KIND_SPAN')
    if (!batch?.body)
      throw new Error('Expected an exported binary span batch')
    const replay = await fetch(`${baseUrl}/v1/traces`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/x-protobuf' },
      body: Uint8Array.from(atob(batch.body), character => character.charCodeAt(0)),
    })
    expect(replay.status).toBe(200)
    if (!child)
      throw new Error('Expected a CLI child')
    await stop(child)
    await start()
    const recovered = await debugListEvents({ ...options, query: { traceId } })
    expect(recovered.data?.events).toHaveLength(6)
    const sorted = latencies.toSorted((left, right) => left - right)
    const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1]
    console.info(JSON.stringify({ samples: latencies.length, logVisibilityP95Ms: p95, spanLifetimeMs: performance.now() - started }))
    expect(p95).toBeLessThan(500)
  }
  finally {
    await Promise.all([tracerProvider.shutdown(), loggerProvider.shutdown()])
    if (child)
      await stop(child)
    await rm(directory, { recursive: true, force: true })
  }
}, 60_000)
