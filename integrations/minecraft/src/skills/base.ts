import type { Mineflayer } from '../libs/mineflayer'

import { useLogger } from '../utils/logger'

const logger = useLogger()

/**
 * Block face direction
 */
export type BlockFace = 'bottom' | 'east' | 'north' | 'side' | 'south' | 'top' | 'west'

/**
 * Position in the world
 */
export interface Position {
  x: number
  y: number
  z: number
}

/**
 * Log a message to the context's output buffer
 */
export function log(_mineflayer: Mineflayer, message: string): void {
  logger.log(message)
  // mineflayer.bot.chat(message)
}
