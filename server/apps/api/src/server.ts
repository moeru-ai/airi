import process from 'node:process'

import { useLogger } from '@guiiai/logg'
import { serve } from '@hono/node-server'

import { createApp } from './app'

function handleProcessError(error: unknown, type: string) {
  useLogger().withError(error).error(type)
}

/**
 * Starts the dedicated resource API HTTP/WebSocket process.
 *
 * Call stack:
 *
 * runApiServer
 *   -> {@link createApp}
 *     -> buildApp
 *       -> business HTTP and WebSocket routes
 */
export async function runApiServer(): Promise<void> {
  const { app, injectWebSocket, port, hostname } = await createApp()
  const server = serve({ fetch: app.fetch, port, hostname })
  injectWebSocket(server)

  process.on('uncaughtException', error => handleProcessError(error, 'Uncaught exception'))
  process.on('unhandledRejection', error => handleProcessError(error, 'Unhandled rejection'))

  await new Promise<void>((resolve, reject) => {
    server.once('close', () => resolve())
    server.once('error', error => reject(error))
  })
}
