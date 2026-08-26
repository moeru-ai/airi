import type { Bot, BotOptions, Plugin } from 'mineflayer'

import type { Mineflayer } from './core'

export interface MineflayerPlugin {
  beforeCleanup?: (mineflayer: Mineflayer) => Promise<void> | void
  created?: (mineflayer: Mineflayer) => Promise<void> | void
  loadPlugin?: (mineflayer: Mineflayer, bot: Bot, options: BotOptions) => Plugin
  spawned?: (mineflayer: Mineflayer) => Promise<void> | void
}

export function wrapPlugin(plugin: Plugin): MineflayerPlugin {
  return {
    loadPlugin: () => (plugin),
  }
}
