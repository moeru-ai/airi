import process, { env } from 'node:process'

import { Format, LogLevel, setGlobalFormat, setGlobalLogLevel, useLogg } from '@guiiai/logg'

import { SatoriClient } from './adapter/satori/client'
import { globalRegistry } from './capabilities/registry'
import { createBotContext, setupMessageEventHandler, setupReadyEventHandler, startPeriodicLoop } from './core'
import { initDb } from './lib/db'

setGlobalFormat(Format.Pretty)
setGlobalLogLevel(LogLevel.Debug)

async function main() {
  const log = useLogg('Main').useGlobalConfig()

  // Initialize database
  await initDb()
  log.log('Database initialized')

  // Create Satori client
  const satoriClient = new SatoriClient({
    url: env.SATORI_WS_URL || 'ws://localhost:5140/satori/v1/events',
    token: env.SATORI_TOKEN,
    apiBaseUrl: env.SATORI_API_BASE_URL,
  })

  // Create bot context
  const botContext = createBotContext(log)

  // Set up event handlers
  setupReadyEventHandler(satoriClient, log)
  setupMessageEventHandler(satoriClient, botContext, log)

  // Connect to Satori server
  await satoriClient.connect()
  log.log('Connected to Satori server')

  globalRegistry.loadStandardActions(satoriClient)

  // Start periodic loop
  startPeriodicLoop(botContext, satoriClient)
  log.log('Periodic loop started')
}

process.on('unhandledRejection', (err) => {
  const log = useLogg('UnhandledRejection').useGlobalConfig()
  log
    .withError(err as Error)
    .withField('cause', (err as any).cause)
    .error('Unhandled rejection')
})

main().catch(console.error)
