import process, { env } from 'node:process'

import { Format, LogLevel, setGlobalFormat, setGlobalLogLevel, useLogg } from '@guiiai/logg'

import { DiscordAdapter } from './adapters/airi-adapter'

setGlobalFormat(Format.Pretty)
setGlobalLogLevel(LogLevel.Log)
const log = useLogg('Bot').useGlobalConfig()

// Create a new client instance
async function main() {
  // Create Discord adapter with configuration
  const adapter = new DiscordAdapter({
    discordToken: env.DISCORD_TOKEN || '', // Fallback to env, but will be updated via WebSocket
    airiToken: env.AIRI_TOKEN || 'abcd',
    airiUrl: env.AIRI_URL || 'ws://localhost:6121/ws',
  })

  await adapter.start()

  // Set up process shutdown hooks
  process.on('SIGINT', async () => {
    log.log('Received SIGINT, shutting down...')
    await adapter.stop()
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    log.log('Received SIGTERM, shutting down...')
    await adapter.stop()
    process.exit(0)
  })
}

main().catch(err => log.withError(err).error('An error occurred'))
