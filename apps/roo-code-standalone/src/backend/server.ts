import path from 'node:path'
import { fileURLToPath } from 'node:url'

import Fastify from 'fastify'
import cors from '@fastify/cors'
import staticFiles from '@fastify/static'
import websocket from '@fastify/websocket'

import { router } from './routes.js'
import { websocketHandler } from './websocket.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = Number(process.env.ROO_PORT) || 3210
const HOST = process.env.ROO_HOST || '127.0.0.1'

async function main() {
  const app = Fastify({ logger: true })

  await app.register(cors, { origin: true })

  // REST API routes
  await app.register(router, { prefix: '/api' })

  // WebSocket endpoint for message passing (replaces vscode.postMessage)
  await app.register(websocket)
  await app.register(async (fastify) => {
    fastify.get('/ws', { websocket: true }, websocketHandler)
  })

  // Serve the built SPA in production
  const distDir = path.resolve(__dirname, '../../dist')
  await app.register(staticFiles, { root: distDir, prefix: '/', wildcard: false })

  // SPA fallback — serve index.html for any non-API, non-ws route
  app.get('*', async (_req, reply) => {
    return reply.sendFile('index.html', distDir)
  })

  try {
    await app.listen({ port: PORT, host: HOST })
    console.log(`[roo-standalone] http://${HOST}:${PORT}`)
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

main().catch(console.error)
