import type { MineflayerOptions } from '../libs/mineflayer'

import { Mineflayer } from '../libs/mineflayer'

// Singleton instance of the Mineflayer bot
let botInstance: Mineflayer | null = null

/**
 * Initialize a new Mineflayer bot instance.
 * Follows singleton pattern to ensure only one bot exists at a time.
 */
export async function initBot(options: MineflayerOptions): Promise<{ bot: Mineflayer }> {
  if (botInstance) {
    throw new Error('Bot already initialized')
  }

  botInstance = await Mineflayer.asyncBuild(options)
  return { bot: botInstance }
}

/**
 * Get the current bot instance.
 * Throws if bot is not initialized.
 */
export function useBot(): { bot: Mineflayer } {
  if (!botInstance) {
    throw new Error('Bot not initialized')
  }

  return {
    bot: botInstance,
  }
}
