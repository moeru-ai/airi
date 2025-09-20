import type { Mineflayer } from '../libs/mineflayer'

import { useLogger } from '../utils/logger'

const logger = useLogger()

/**
 * Log a message to the context's output buffer
 */
export function log(mineflayer: Mineflayer, message: string): void {
  logger.log(message)
  mineflayer.bot.chat(message)
}

/**
 * Position in the world
 */
export interface Position {
  x: number
  y: number
  z: number
}

/**
 * Block face direction
 */
export type BlockFace = 'top' | 'bottom' | 'north' | 'south' | 'east' | 'west' | 'side'
