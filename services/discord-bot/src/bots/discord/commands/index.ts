import { REST, Routes, SlashCommandBuilder } from 'discord.js'

export * from './ping'
export * from './summon'

export async function registerCommands(token: string, clientId: string) {
  const rest = new REST()

  rest.setToken(token)
  rest.put(
    Routes.applicationCommands(clientId),
    { body: [
      new SlashCommandBuilder().setName('ping').setDescription('Replies with Pong!'),
      new SlashCommandBuilder().setName('summon').setDescription('Summons the bot to your voice channel'),
    ] },
  )
}
