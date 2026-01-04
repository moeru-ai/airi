import process, { env } from 'node:process'

import { Format, LogLevel, setGlobalFormat, setGlobalLogLevel, useLogg } from '@guiiai/logg'

import { SatoriAdapter } from './adapters/airi-adapter'

setGlobalFormat(Format.Pretty)
setGlobalLogLevel(LogLevel.Log)
const log = useLogg('Bot').useGlobalConfig()

// Create a new Satori adapter instance
async function main() {
  // Create Satori adapter with configuration
  const adapter = new SatoriAdapter({
    satoriWsUrl: env.SATORI_WS_URL || 'ws://localhost:5140/v1/events',
    satoriApiUrl: env.SATORI_API_URL || 'http://localhost:5140',
    satoriToken: env.SATORI_TOKEN,
    airiToken: env.AIRI_TOKEN || 'abcd',
    airiUrl: env.AIRI_URL || 'ws://localhost:6121/ws',
  })

  await adapter.start()

  // Set up process shutdown hooks
  async function gracefulShutdown(signal: string) {
    log.log(`Received ${signal}, shutting down...`)
    await adapter.stop()
    process.exit(0)
  }

  process.on('SIGINT', async () => {
    await gracefulShutdown('SIGINT')
  })

  process.on('SIGTERM', async () => {
    await gracefulShutdown('SIGTERM')
  })
}

main().catch(err => log.withError(err).error('An error occurred'))
