/**
 * Local integration smoke for the `ws.connections.active` ObservableGauge
 * pattern used in `apps/server/src/routes/chat-ws/index.ts`.
 *
 * Reproduces the exact pattern (Map<userId, Set<ctx>> registry +
 * `addCallback` walking it) inside a real Hono + @hono/node-ws server, then
 * drives it with real WebSocket clients and reads the exported gauge back via
 * an InMemoryMetricExporter. If this passes locally with OTEL_DEBUG=true,
 * the production code path is correct and any prod-side 0 reading is a
 * deployment/lifecycle issue, not a code bug.
 *
 * Usage:
 *   pnpm -F @proj-airi/server exec node --import tsx ./src/scripts/otel-ws-smoke.mjs
 *
 * With OTel diagnostic logs (verbose, includes export cycles):
 *   OTEL_DEBUG=true pnpm -F @proj-airi/server exec node --import tsx ./src/scripts/otel-ws-smoke.mjs
 */
import { env, exit } from 'node:process'
import { setTimeout as sleep } from 'node:timers/promises'

import { serve } from '@hono/node-server'
import { createNodeWebSocket } from '@hono/node-ws'
import { diag, DiagConsoleLogger, DiagLogLevel, metrics as otelMetrics } from '@opentelemetry/api'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { AggregationTemporality, InMemoryMetricExporter, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { Hono } from 'hono'

if (env.OTEL_DEBUG === 'true')
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG)
// Match production: only metrics matter here; suppress trace/log exporters so
// NodeSDK doesn't try to reach 127.0.0.1:4318 (ECONNREFUSED) when running this
// without a local OTel collector.
env.OTEL_TRACES_EXPORTER = 'none'
env.OTEL_LOGS_EXPORTER = 'none'

// Long export interval — we drive flushes manually via `reader.forceFlush()`
// so the assertions are deterministic regardless of wall-clock timing.
const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE)
const reader = new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 60_000 })
const sdk = new NodeSDK({
  resource: resourceFromAttributes({ 'service.name': 'otel-ws-smoke' }),
  metricReaders: [reader],
  instrumentations: [],
})
sdk.start()

const meter = otelMetrics.getMeter('ws-smoke')
const wsConnectionsActive = meter.createObservableGauge('ws.connections.active', {
  description: 'Active WS connections (live registry size)',
})

// Identical structure to chat-ws/index.ts: Map<userId, Set<connectionKey>>.
// Multi-tab support requires Set (not just Map.size).
const userConnections = new Map()

let callbackInvocations = 0
wsConnectionsActive.addCallback((result) => {
  let total = 0
  for (const conns of userConnections.values()) total += conns.size
  callbackInvocations++
  console.info(`[ws-smoke] callback #${callbackInvocations} fired: total=${total}, users=${userConnections.size}`)
  result.observe(total)
})

const app = new Hono()
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })

app.get('/ws', upgradeWebSocket((c) => {
  const userId = c.req.query('user') ?? 'anon'
  // Per-connection unique identifier captured in this closure. Each WS upgrade
  // invokes the handler factory exactly once, so each connection has its own
  // Symbol — mirrors how chat-ws keys by `HonoWsInvocableEventContext`.
  const connectionKey = Symbol('conn')
  return {
    onOpen() {
      let conns = userConnections.get(userId)
      if (!conns) {
        conns = new Set()
        userConnections.set(userId, conns)
      }
      conns.add(connectionKey)
      console.info(`[ws-smoke] onOpen user=${userId} (now ${conns.size} for this user)`)
    },
    onClose() {
      const conns = userConnections.get(userId)
      if (!conns)
        return
      conns.delete(connectionKey)
      if (conns.size === 0)
        userConnections.delete(userId)
      console.info(`[ws-smoke] onClose user=${userId}`)
    },
  }
}))

let server
const { port } = await new Promise((resolve) => {
  server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }, info => resolve(info))
})
injectWebSocket(server)
console.info(`[ws-smoke] listening on 127.0.0.1:${port}\n`)

async function readGaugeNow() {
  await reader.forceFlush()
  const all = exporter.getMetrics()
  const last = all.at(-1)
  for (const sm of last?.scopeMetrics ?? []) {
    for (const m of sm.metrics) {
      if (m.descriptor.name === 'ws.connections.active')
        return m.dataPoints.at(-1)?.value ?? null
    }
  }
  return null
}

const results = []
function assert(label, expected, actual) {
  const ok = actual === expected
  console.info(`[ws-smoke] ${ok ? '✅' : '❌'} ${label}: expected=${expected}, observed=${actual}\n`)
  results.push(ok)
}

async function openClient(user) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?user=${encodeURIComponent(user)}`)
  await new Promise((res, rej) => {
    ws.addEventListener('open', () => res(), { once: true })
    ws.addEventListener('error', e => rej(e), { once: true })
  })
  // Give the server's onOpen handler a tick to fire after the upgrade.
  await sleep(50)
  return ws
}

async function closeClient(ws) {
  ws.close()
  await sleep(150)
}

console.info('=== Phase A: open 3 alice + 2 bob ===')
const a1 = await openClient('alice')
const a2 = await openClient('alice')
const a3 = await openClient('alice')
const b1 = await openClient('bob')
const b2 = await openClient('bob')
assert('5 active (3 alice + 2 bob)', 5, await readGaugeNow())

console.info('=== Phase B: close 2 alice ===')
await closeClient(a1)
await closeClient(a2)
assert('3 active (1 alice + 2 bob)', 3, await readGaugeNow())

console.info('=== Phase C: close remaining ===')
await closeClient(a3)
await closeClient(b1)
await closeClient(b2)
assert('0 active (registry empty)', 0, await readGaugeNow())

server.close()
await sdk.shutdown()

const passed = results.every(Boolean)
console.info(`[ws-smoke] ${passed ? '✅ ALL PASSED' : '❌ FAIL'} — callback fired ${callbackInvocations} times across ${results.length} flushes`)
exit(passed ? 0 : 1)
