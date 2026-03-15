import process, { exit } from 'node:process'

import MineflayerArmorManager from 'mineflayer-armor-manager'

import { Client } from '@proj-airi/server-sdk'
import { loader as MineflayerAutoEat } from 'mineflayer-auto-eat'
import { plugin as MineflayerCollectBlock } from 'mineflayer-collectblock'
import { pathfinder as MineflayerPathfinder } from 'mineflayer-pathfinder'
import { plugin as MineflayerPVP } from 'mineflayer-pvp'
import { plugin as MineflayerTool } from 'mineflayer-tool'

import { MinecraftServiceShell } from './airi/service-shell'
import { CognitiveEngine } from './cognitive'
import { config, initEnv } from './composables/config'
import { MinecraftRuntimeConfigManager } from './composables/runtime-config'
import { DebugService } from './debug'
import { setupMineflayerViewer } from './debug/mineflayer-viewer'
import { Mineflayer, wrapPlugin } from './libs/mineflayer'
import { MinecraftBotRuntime } from './minecraft-bot-runtime'
import { initLogger, useLogger } from './utils/logger'

// ...

async function main() {
  initLogger() // todo: save logs to file
  initEnv()

  const runtimeConfigManager = new MinecraftRuntimeConfigManager()
  const configManager = {
    load: () => {
      const snapshot = runtimeConfigManager.load()
      config.bot = {
        ...config.bot,
        ...snapshot.effectiveBotConfig,
      }
      return snapshot
    },
    save: (editableConfig: Parameters<MinecraftRuntimeConfigManager['save']>[0]) => {
      const snapshot = runtimeConfigManager.save(editableConfig)
      config.bot = {
        ...config.bot,
        ...snapshot.effectiveBotConfig,
      }
      return snapshot
    },
  }

  configManager.load()

  if (config.debug.server || config.debug.viewer || config.debug.mcp) {
    useLogger().warn(
      [
        '==============================================================================',
        'SECURITY NOTICE:',
        'The MCP Server, Debug Server, and/or Prismarine Viewer endpoints are currently',
        'enabled. These endpoints are completely unauthenticated. Enabling these exposes',
        'your bot\'s internal state and capabilities to anyone who can reach the ports.',
        'This can lead to Remote Code Execution (RCE) and full compromise of the bot',
        'if exposed to the internet or untrusted local networks. Ensure they are not',
        'externally accessible.',
        '==============================================================================',
      ].join('\n'),
    )
  }

  // Start debug server
  if (config.debug.server) {
    DebugService.getInstance().start()
  }

  // Connect airi server
  const airiClient = new Client({
    name: config.airi.clientName,
    url: config.airi.wsBaseUrl,
    possibleEvents: ['module:configure', 'spark:command', 'context:update'],
  })
  await airiClient.connect()

  let activeRuntime: MinecraftBotRuntime | null = null
  let viewerInitialized = false

  async function createManagedBot(botConfig: typeof config.bot) {
    activeRuntime = new MinecraftBotRuntime({
      initialConfig: botConfig,
      createBot: async (nextBotConfig) => {
        config.bot = {
          ...config.bot,
          ...nextBotConfig,
        }

        const bot = await Mineflayer.asyncBuild({
          botConfig: nextBotConfig,
          plugins: [
            wrapPlugin(MineflayerArmorManager),
            wrapPlugin(MineflayerAutoEat),
            wrapPlugin(MineflayerCollectBlock),
            wrapPlugin(MineflayerPathfinder),
            wrapPlugin(MineflayerPVP),
            wrapPlugin(MineflayerTool),
          ],
          reconnect: {
            enabled: true,
            maxRetries: 5,
          },
        })

        if (config.debug.viewer && !viewerInitialized) {
          setupMineflayerViewer(bot, { port: 3007, firstPerson: true })
          viewerInitialized = true
        }

        await bot.loadPlugin(CognitiveEngine({ airiClient }))

        // Setup Tool Executor for Debug Dashboard
        const { setupToolExecutor } = await import('./debug/tool-executor')
        setupToolExecutor(bot)

        return bot
      },
    })

    await activeRuntime.initialize()

    return activeRuntime
  }

  const shell = new MinecraftServiceShell({
    airiClient,
    configManager,
    createBot: createManagedBot,
    serviceName: config.airi.clientName,
  })
  await shell.initialize()

  process.on('SIGINT', () => {
    Promise.resolve(activeRuntime?.stop())
      .catch((err: Error) => {
        useLogger().errorWithError('Failed to stop Minecraft runtime cleanly', err)
      })
      .finally(() => {
        airiClient.close()
        exit(0)
      })
  })
}

main().catch((err: Error) => {
  useLogger().errorWithError('Fatal error', err)
  exit(1)
})
