import type { H3Event } from 'h3'

import process from 'node:process'

import { createGatewayLogger } from '@proj-airi/visual-chat-observability'
import {
  VISUAL_CHAT_GATEWAY_TOKEN_HEADER,
  VISUAL_CHAT_SESSION_TOKEN_HEADER,
} from '@proj-airi/visual-chat-protocol'
import { SessionStore } from '@proj-airi/visual-chat-runtime'
import { plugin as wsPlugin } from 'crossws/server'
import { createApp, defineEventHandler, getHeader, serve, setResponseHeaders } from 'h3'

import { createHealthRoute } from './api/health'
import { verifyWsSessionAccess } from './auth'
import { gatewayEnv } from './gateway-env'
import { GatewayRealtimeManager } from './realtime/manager'
import { createBootstrapRoutes } from './routes/bootstrap'
import { createDiagnosticRoutes } from './routes/diagnostics'
import { createRoomRoutes } from './routes/rooms'
import { createSessionRoutes } from './routes/sessions'
import { createWebhookRoutes } from './routes/webhook'
import { createWorkerProxyRoutes } from './routes/worker-proxy'
import { createWorkerRoutes } from './routes/workers'
import { SessionRecordRepository } from './session-records'
import { createWsHandler } from './ws'

const log = createGatewayLogger()
const port = gatewayEnv.port
const store = new SessionStore()

const app = createApp()
let broadcast: (sessionId: string, event: string, data: unknown) => void = () => {}
const sessionRecordRepository = new SessionRecordRepository()
const realtimeManager = new GatewayRealtimeManager(
  store,
  (sessionId, event, data) => broadcast(sessionId, event, data),
  gatewayEnv.workerUrl,
  sessionRecordRepository,
)

function corsHeaders(event: H3Event) {
  setResponseHeaders(event, {
    'Access-Control-Allow-Origin': getHeader(event, 'origin') || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': [
      'Content-Type',
      'Authorization',
      VISUAL_CHAT_GATEWAY_TOKEN_HEADER,
      VISUAL_CHAT_SESSION_TOKEN_HEADER,
    ].join(', '),
    'Access-Control-Max-Age': '86400',
  })
}

app.use(defineEventHandler((event) => {
  corsHeaders(event)
  if (event.method === 'OPTIONS')
    return ''
}))

app.use('/health', createHealthRoute())

const ws = createWsHandler({
  onClientMessage: message => realtimeManager.handleClientMessage(message),
  authorizeSessionAccess: (sessionId, sessionToken) => verifyWsSessionAccess(sessionId, sessionToken),
})
const { handler: wsHandler } = ws
broadcast = ws.broadcast

app.use(createBootstrapRoutes())
app.use(createWorkerRoutes())
app.use(createWorkerProxyRoutes())
app.use(createSessionRoutes(store, broadcast, {
  onSessionCreated: (sessionId, roomName) => realtimeManager.attachSession(sessionId, roomName),
  onSessionDeleted: sessionId => realtimeManager.removeSession(sessionId),
  getSessionMessages: sessionId => realtimeManager.getMessages(sessionId),
  getSessionRecord: sessionId => realtimeManager.getRecord(sessionId),
  listSessionRecords: () => realtimeManager.listRecords(),
  restoreSession: sessionId => realtimeManager.restoreSession(sessionId),
}))
app.use(createRoomRoutes(store))
app.use(createDiagnosticRoutes(store, realtimeManager))
app.use(createWebhookRoutes(store, broadcast))

app.use('/ws', wsHandler as any)

async function main() {
  const server = serve(app, {
    // @ts-expect-error h3 attaches `.crossws` metadata to the fetch response for the plugin.
    plugins: [wsPlugin({ resolve: async req => (await app.fetch(req)).crossws })],
    port,
    hostname: gatewayEnv.host,
    reusePort: true,
    silent: true,
    manual: true,
  })

  await server.serve()
  log.withTag('main').log(`Gateway listening on ${gatewayEnv.host}:${port}`)
}

main().catch((err) => {
  log.withTag('main').error(`Gateway failed to start: ${err}`)
  process.exit(1)
})
