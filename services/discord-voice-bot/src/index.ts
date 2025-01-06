import { env } from 'node:process'
import { Format, LogLevel, setGlobalFormat, setGlobalLogLevel, useLogg } from '@guiiai/logg'
import { Client, Events, GatewayIntentBits } from 'discord.js'

import { handlePing, handleSummon, registerCommands } from './bots/discord/commands'
import { WhisperLargeV3Pipeline } from './pipelines/tts'

import 'dotenv/config'

setGlobalFormat(Format.Pretty)
setGlobalLogLevel(LogLevel.Log)
const log = useLogg('Bot').useGlobalConfig()

// Create a new client instance
async function main() {
  await WhisperLargeV3Pipeline.getInstance()
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] })

  // When the client is ready, run this code (only once).
  // The distinction between `client: Client<boolean>` and `readyClient: Client<true>` is important for TypeScript developers.
  // It makes some properties non-nullable.
  client.once(Events.ClientReady, (readyClient) => {
    log.withField('identity', readyClient.user.tag).log(`Ready!`)
  })

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand())
      return

    log.log(interaction)

    switch (interaction.commandName) {
      case 'ping':
        await handlePing(interaction)
        break
      case 'summon':
        await handleSummon(log, interaction)
        break
    }
  })

  await registerCommands()
  // Log in to Discord with your client's token
  await client.login(env.DISCORD_TOKEN)
}

main().catch(log.error)
