import { env } from 'node:process'

import { REST, Routes, SlashCommandBuilder } from 'discord.js'

export * from './ping'
export * from './summon'

export async function registerCommands() {
  const rest = new REST()

  rest.setToken(env.DISCORD_TOKEN)
  rest.put(
    Routes.applicationCommands(env.DISCORD_BOT_CLIENT_ID),
    { body: [
      new SlashCommandBuilder().setName('ping').setDescription('Replies with Pong!'),
      new SlashCommandBuilder().setName('summon').setDescription('Summons the bot to your voice channel'),
    ] },
  )
}
