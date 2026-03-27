import process, { env } from 'node:process'

import { Format, LogLevel, setGlobalFormat, setGlobalLogLevel, useLogg } from '@guiiai/logg'

import { DiscordAdapter } from './adapters/airi-adapter'

setGlobalFormat(Format.Pretty)
setGlobalLogLevel(LogLevel.Log)
const log = useLogg('Bot').useGlobalConfig()

// Create a new client instance
async function main() {
  log.log('Discord Bot starting up...')
  if (env.DISCORD_GUILD_ID) {
    log.log(`Development Guild ID enabled: ${env.DISCORD_GUILD_ID}`)
  }
  else {
    log.log('No Guild ID provided. Slash commands will be registered globally.')
  }

  if (env.DISCORD_TOKEN) {
    log.log('Bot token found in environment variables.')
  }

  // Create Discord adapter with configuration
  const adapter = new DiscordAdapter({
    discordToken: env.DISCORD_TOKEN || '', // Fallback to env, but will be updated via WebSocket
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
