import process from 'node:process'

import { createWorkerLogger } from '@proj-airi/visual-chat-observability'
import { VISUAL_CHAT_GATEWAY_TOKEN_HEADER } from '@proj-airi/visual-chat-protocol'
import { plugin as wsPlugin } from 'crossws/server'
import { createApp, defineEventHandler, getHeader, serve, setResponseHeaders, setResponseStatus } from 'h3'

import { WORKER_DEFAULT_OLLAMA_MODEL } from './env/defaults'
import { parseWorkerConfig } from './env/parse'
import { startHeartbeat } from './health/heartbeat'
import { createOllamaLiteRouter } from './ollama-lite'

const log = createWorkerLogger()
const config = parseWorkerConfig()

const app = createApp()

app.use(defineEventHandler((event) => {
  const origin = getHeader(event, 'origin') || '*'
  setResponseHeaders(event, {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': ['Content-Type', VISUAL_CHAT_GATEWAY_TOKEN_HEADER].join(', '),
    'Access-Control-Max-Age': '86400',
  })

  if (event.method === 'OPTIONS') {
    setResponseStatus(event, 204)
    return ''
  }
}))

async function main() {
  const ollamaModel = WORKER_DEFAULT_OLLAMA_MODEL
  if (config.ollamaModel !== WORKER_DEFAULT_OLLAMA_MODEL) {
    log.withTag('main').warn(`Ignoring unsupported OLLAMA_MODEL=${config.ollamaModel}; using ${WORKER_DEFAULT_OLLAMA_MODEL}.`)
  }

  const { router, duplexWsHandler } = createOllamaLiteRouter({
    baseUrl: config.ollamaBaseUrl,
    model: ollamaModel,
  })

  app.use(router)
  app.use('/ws/duplex', duplexWsHandler as any)

  const server = serve(app, {
    // @ts-expect-error h3 attaches `.crossws` metadata to the fetch response for the plugin.
    plugins: [wsPlugin({ resolve: async req => (await app.fetch(req)).crossws })],
    port: config.port,
    hostname: config.host,
    reusePort: true,
    silent: true,
    manual: true,
  })

  await server.serve()
  log.withTag('main').log(`Worker bridge listening on ${config.host}:${config.port}`)
  log.withTag('main').log(`Worker profile: ollama-lite`)
  log.withTag('main').log(`Ollama lite backend: ${config.ollamaBaseUrl} (model: ${ollamaModel})`)

  if (config.gatewayUrl)
    startHeartbeat({ gatewayUrl: config.gatewayUrl })
}

main().catch((error) => {
  log.withTag('main').error(`Worker bridge failed to start: ${error}`)
  process.exit(1)
})
