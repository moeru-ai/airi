import type { Bot, BotOptions, Plugin } from 'mineflayer'

import type { Mineflayer } from '.'

export interface MineflayerPlugin {
  created?: (mineflayer: Mineflayer) => void | Promise<void>
  loadPlugin?: (mineflayer: Mineflayer, bot: Bot, options: BotOptions) => Plugin
  spawned?: (mineflayer: Mineflayer) => void | Promise<void>
  beforeCleanup?: (mineflayer: Mineflayer) => void | Promise<void>
}

export function wrapPlugin(plugin: Plugin): MineflayerPlugin {
  return {
    loadPlugin: () => (plugin),
  }
}
