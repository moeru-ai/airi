import type { Logg } from '@guiiai/logg'
import type { Bot, BotOptions } from 'mineflayer'

import type { Mineflayer } from './core'
import type { MineflayerPlugin } from './plugin'

interface PluginManagerDeps {
  logger: Logg
  mineflayer: Mineflayer
  getBot: () => Bot
  botConfig: BotOptions
  initialPlugins?: readonly MineflayerPlugin[]
}

export interface PluginManager {
  getRegisteredPlugins: () => readonly MineflayerPlugin[]
  register: (plugin: MineflayerPlugin) => boolean
  loadPlugin: (plugin: MineflayerPlugin) => Promise<void>
  initializeRegisteredPlugins: () => Promise<void>
  runSpawnedHooks: (plugins?: readonly MineflayerPlugin[]) => Promise<void>
  runBeforeCleanupHooks: (plugins?: readonly MineflayerPlugin[]) => Promise<void>
}

export function createPluginManager(deps: PluginManagerDeps): PluginManager {
  const registeredPlugins: MineflayerPlugin[] = [...(deps.initialPlugins ?? [])]

  const getRegisteredPlugins = (): readonly MineflayerPlugin[] => registeredPlugins

  const register = (plugin: MineflayerPlugin): boolean => {
    if (registeredPlugins.includes(plugin))
      return false

    registeredPlugins.push(plugin)
    return true
  }

  const runCreatedHooks = async (plugins: readonly MineflayerPlugin[]): Promise<void> => {
    for (const plugin of plugins) {
      if (plugin.created)
        await plugin.created(deps.mineflayer)
    }
  }

  const runLoadHooks = async (plugins: readonly MineflayerPlugin[]): Promise<void> => {
    for (const plugin of plugins) {
      if (!plugin.loadPlugin)
        continue

      const bot = deps.getBot()
      const loadedPlugin = await plugin.loadPlugin(deps.mineflayer, bot, deps.botConfig)
      bot.loadPlugin(loadedPlugin)
    }
  }

  const initializePlugins = async (plugins: readonly MineflayerPlugin[]): Promise<void> => {
    await runCreatedHooks(plugins)
    await runLoadHooks(plugins)
  }

  const loadPlugin = async (plugin: MineflayerPlugin): Promise<void> => {
    register(plugin)
    await initializePlugins([plugin])
  }

  const initializeRegisteredPlugins = async (): Promise<void> => {
    await initializePlugins(registeredPlugins)
  }

  const runSpawnedHooks = async (plugins: readonly MineflayerPlugin[] = registeredPlugins): Promise<void> => {
    for (const plugin of plugins) {
      if (plugin.spawned)
        await plugin.spawned(deps.mineflayer)
    }
  }

  const runBeforeCleanupHooks = async (plugins: readonly MineflayerPlugin[] = registeredPlugins): Promise<void> => {
    for (const plugin of plugins) {
      if (!plugin.beforeCleanup)
        continue

      try {
        await plugin.beforeCleanup(deps.mineflayer)
      }
      catch (error) {
        deps.logger.errorWithError('Plugin beforeCleanup failed', error as Error)
      }
    }
  }

  return {
    getRegisteredPlugins,
    register,
    loadPlugin,
    initializeRegisteredPlugins,
    runSpawnedHooks,
    runBeforeCleanupHooks,
  }
}
