import type { CacheType, ChatInputCommandInteraction } from 'discord.js'

export async function handlePing(interaction: ChatInputCommandInteraction<CacheType>) {
  await interaction.reply('Pong!')
}
