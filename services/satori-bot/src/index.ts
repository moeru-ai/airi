import process from 'node:process'

import { Format, LogLevel, setGlobalFormat, setGlobalLogLevel, useLogg } from '@guiiai/logg'

import { config } from './config'
import { SatoriClient } from './adapter/satori/client'
import { globalRegistry } from './capabilities/registry'
import { createBotContext, setupMessageEventHandler, setupReadyEventHandler, startPeriodicLoop } from './core/index'
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
    url: config.satori.wsUrl,
    token: config.satori.token,
    apiBaseUrl: config.satori.apiBaseUrl,
  })

  // Create bot context
  const botContext = await createBotContext(log)

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
  const cause = (err instanceof Error && 'cause' in err) ? err.cause : undefined
  log
    .withError(err as Error)
    .withField('cause', cause)
    .error('Unhandled rejection occurred')
})

process.on('uncaughtException', (err) => {
  const log = useLogg('UncaughtException').useGlobalConfig()
  log
    .withError(err)
    .error('Uncaught exception occurred')
})

main().catch((err) => {
  const log = useLogg('Main').useGlobalConfig()
  log.withError(err).error('Fatal error in main loop')
  process.exit(1)
})

