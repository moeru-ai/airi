import { REST, Routes, SlashCommandBuilder } from 'discord.js'

export * from './ping'
export * from './summon'

export async function registerCommands(token: string, clientId: string, guildId?: string) {
  const rest = new REST()

  rest.setToken(token)
  
  const body = [
    new SlashCommandBuilder().setName('ping').setDescription('Replies with Pong!'),
    new SlashCommandBuilder().setName('summon').setDescription('Summons the bot to your voice channel'),
    new SlashCommandBuilder().setName('leave').setDescription('Forces the bot to leave the voice channel'),
  ]

  if (guildId) {
    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body },
    )
  }
  else {
    await rest.put(
      Routes.applicationCommands(clientId),
      { body },
    )
  }
}
