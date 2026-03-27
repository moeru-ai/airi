import type { Logg } from '@guiiai/logg'
import type { Bot, BotOptions } from 'mineflayer'

import type { Mineflayer } from './core'
import type { MineflayerPlugin } from './plugin'

interface PluginLifecycleState {
  createdGeneration: number
  loadedGeneration: number
  spawnedGeneration: number
  cleanupGeneration: number
}

export interface PluginRuntimeDeps {
  logger: Logg
  mineflayer: Mineflayer
  botConfig: BotOptions
  initialPlugins?: readonly MineflayerPlugin[]
}

export interface PluginRuntime {
  getRegisteredPlugins: () => readonly MineflayerPlugin[]
  register: (plugin: MineflayerPlugin) => boolean
  loadPlugin: (plugin: MineflayerPlugin) => Promise<void>
  initializeGeneration: (bot: Bot) => Promise<void>
  onSpawn: () => Promise<void>
  beforeCleanup: () => Promise<void>
}

const UNINITIALIZED_GENERATION = -1

export function createPluginRuntime(deps: PluginRuntimeDeps): PluginRuntime {
  const registeredPlugins: MineflayerPlugin[] = [...(deps.initialPlugins ?? [])]
  const pluginLifecycleState = new Map<MineflayerPlugin, PluginLifecycleState>()

  let currentGeneration = 0
  let currentBot: Bot | null = null
  let spawnedForCurrentGeneration = false
  let lifecycleQueue: Promise<void> = Promise.resolve()

  const getPluginState = (plugin: MineflayerPlugin): PluginLifecycleState => {
    let state = pluginLifecycleState.get(plugin)
    if (!state) {
      state = {
        createdGeneration: UNINITIALIZED_GENERATION,
        loadedGeneration: UNINITIALIZED_GENERATION,
        spawnedGeneration: UNINITIALIZED_GENERATION,
        cleanupGeneration: UNINITIALIZED_GENERATION,
      }
      pluginLifecycleState.set(plugin, state)
    }

    return state
  }

  const getPluginLabel = (plugin: MineflayerPlugin): string => {
    return (
      plugin.loadPlugin?.name
      || plugin.created?.name
      || plugin.spawned?.name
      || plugin.beforeCleanup?.name
      || `plugin@${registeredPlugins.indexOf(plugin)}`
    )
  }

  // NOTICE: `lifecycleQueue` guarantees per-generation ordering, but it is not re-entrant.
  // If a plugin lifecycle hook (created/loadPlugin/spawned/beforeCleanup) awaits
  // `mineflayer.loadPlugin()`, that call queues behind the currently running lifecycle task
  // on the same queue and can deadlock.
  const enqueue = async <T>(task: () => Promise<T>): Promise<T> => {
    const nextTask = lifecycleQueue.then(task)

    lifecycleQueue = nextTask
      .then(() => undefined)
      .catch(() => undefined)

    return nextTask
  }

  const runCreatedAndLoadHooks = async (
    plugin: MineflayerPlugin,
    generation: number,
    bot: Bot,
  ): Promise<void> => {
    const state = getPluginState(plugin)
    const pluginLabel = getPluginLabel(plugin)

    if (plugin.created && state.createdGeneration !== generation) {
      try {
        await plugin.created(deps.mineflayer)
        state.createdGeneration = generation
      }
      catch (error) {
        deps.logger.withFields({
          plugin: pluginLabel,
          generation,
        }).errorWithError('Plugin created hook failed', error as Error)
        throw error
      }
    }

    if (plugin.loadPlugin && state.loadedGeneration !== generation) {
      try {
        const loadedPlugin = await plugin.loadPlugin(deps.mineflayer, bot, deps.botConfig)
        bot.loadPlugin(loadedPlugin)
        state.loadedGeneration = generation
      }
      catch (error) {
        deps.logger.withFields({
          plugin: pluginLabel,
          generation,
        }).errorWithError('Plugin loadPlugin hook failed', error as Error)
        throw error
      }
    }
  }

  const runSpawnedHook = async (
    plugin: MineflayerPlugin,
    generation: number,
  ): Promise<void> => {
    if (!plugin.spawned)
      return

    const state = getPluginState(plugin)
    if (state.spawnedGeneration === generation)
      return

    const pluginLabel = getPluginLabel(plugin)

    try {
      await plugin.spawned(deps.mineflayer)
      state.spawnedGeneration = generation
    }
    catch (error) {
      deps.logger.withFields({
        plugin: pluginLabel,
        generation,
      }).errorWithError('Plugin spawned hook failed', error as Error)
      throw error
    }
  }

  const getRegisteredPlugins = (): readonly MineflayerPlugin[] => registeredPlugins

  const register = (plugin: MineflayerPlugin): boolean => {
    if (registeredPlugins.includes(plugin))
      return false

    registeredPlugins.push(plugin)
    getPluginState(plugin)
    return true
  }

  const loadPlugin = async (plugin: MineflayerPlugin): Promise<void> => {
    await enqueue(async () => {
      register(plugin)

      if (!currentBot || currentGeneration === 0)
        return

      const activeGeneration = currentGeneration
      const activeBot = currentBot

      await runCreatedAndLoadHooks(plugin, activeGeneration, activeBot)

      if (spawnedForCurrentGeneration)
        await runSpawnedHook(plugin, activeGeneration)
    })
  }

  const initializeGeneration = async (bot: Bot): Promise<void> => {
    await enqueue(async () => {
      currentGeneration += 1
      const generation = currentGeneration

      currentBot = bot
      spawnedForCurrentGeneration = false

      for (const plugin of registeredPlugins)
        await runCreatedAndLoadHooks(plugin, generation, bot)
    })
  }

  const onSpawn = async (): Promise<void> => {
    await enqueue(async () => {
      if (!currentBot || currentGeneration === 0)
        return

      const generation = currentGeneration
      spawnedForCurrentGeneration = true

      for (const plugin of registeredPlugins)
        await runSpawnedHook(plugin, generation)
    })
  }

  const beforeCleanup = async (): Promise<void> => {
    await enqueue(async () => {
      if (currentGeneration === 0)
        return

      const generation = currentGeneration

      for (const plugin of registeredPlugins) {
        const state = getPluginState(plugin)

        if (state.cleanupGeneration === generation)
          continue

        if (!plugin.beforeCleanup) {
          state.cleanupGeneration = generation
          continue
        }

        const pluginLabel = getPluginLabel(plugin)

        try {
          await plugin.beforeCleanup(deps.mineflayer)
        }
        catch (error) {
          deps.logger.withFields({
            plugin: pluginLabel,
            generation,
          }).errorWithError('Plugin beforeCleanup failed', error as Error)
        }
        finally {
          state.cleanupGeneration = generation
        }
      }
    })
  }

  return {
    getRegisteredPlugins,
    register,
    loadPlugin,
    initializeGeneration,
    onSpawn,
    beforeCleanup,
  }
}
