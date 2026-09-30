import process from 'node:process'

import { chmod, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

import { initLogger, useLogg } from '@guiiai/logg'
import { serve } from '@hono/node-server'

import { createApp } from './app'
import { loadConfig } from './config'
import { closeHttpServer } from './server'
import { DebugStorage } from './storage'

initLogger()
const log = useLogg('debug-server').useGlobalConfig()

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

  log.withFields({ host: config.host, port: config.port, databasePath: config.databasePath }).log('Listening for local traces')
  if (config.tokenGenerated)
    process.stderr.write(`[debug-server] Generated Bearer token: ${config.token}\n`)

  let stopping = false
  async function stop(signal: string): Promise<void> {
    if (stopping)
      return
    stopping = true
    log.withField('signal', signal).log('Closing the server')
    await closeHttpServer(server)
    await storage.close()
  }

  process.once('SIGINT', () => void stop('SIGINT'))
  process.once('SIGTERM', () => void stop('SIGTERM'))
}

main().catch((error) => {
  log.withError(error).error('Startup failed')
  process.exitCode = 1
})
