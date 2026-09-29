import process from 'node:process'

import { chmod, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

import { serve } from '@hono/node-server'
import { errorMessageFromUnknown } from '@proj-airi/stage-shared/error-message'

import { createApp } from './app'
import { loadConfig } from './config'
import { closeHttpServer } from './server'
import { DebugStorage } from './storage'

async function main(): Promise<void> {
  const config = loadConfig()
  await mkdir(dirname(config.databasePath), { recursive: true, mode: 0o700 })
  const storage = await DebugStorage.open({
    maxStoredBytes: config.maxStoredBytes,
    path: config.databasePath,
    retentionDays: config.retentionDays,
  })
  const app = createApp(storage, config)
  await chmod(config.databasePath, 0o600)
  const server = serve({ fetch: app.fetch, hostname: config.host, port: config.port })

  console.info(`[debug-server] Listening on http://${config.host}:${config.port}`)
  console.info(`[debug-server] Database: ${config.databasePath}`)
  if (config.tokenGenerated)
    console.info(`[debug-server] Generated Bearer token: ${config.token}`)

  let stopping = false
  async function stop(signal: string): Promise<void> {
    if (stopping)
      return
    stopping = true
    console.info(`[debug-server] ${signal} received. Closing the server.`)
    await closeHttpServer(server)
    await storage.close()
  }

  process.once('SIGINT', () => void stop('SIGINT'))
  process.once('SIGTERM', () => void stop('SIGTERM'))
}

main().catch((error) => {
  console.error(`[debug-server] Startup failed: ${errorMessageFromUnknown(error)}`)
  process.exitCode = 1
})
