import process, { exit } from 'node:process'

import MineflayerArmorManager from 'mineflayer-armor-manager'

import { Client } from '@proj-airi/server-sdk'
import { loader as MineflayerAutoEat } from 'mineflayer-auto-eat'
import { plugin as MineflayerCollectBlock } from 'mineflayer-collectblock'
import { pathfinder as MineflayerPathfinder } from 'mineflayer-pathfinder'
import { plugin as MineflayerPVP } from 'mineflayer-pvp'
import { plugin as MineflayerTool } from 'mineflayer-tool'

import { startAiriClientConnection } from './airi/start-background-client'
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
  const logger = useLogger()

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

  let runtimeSnapshot = configManager.load()

  if (config.debug.server || config.debug.viewer || config.debug.mcp) {
    logger.warn(
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
  let airiConnectionLifecycle: ReturnType<typeof startAiriClientConnection> | null = null
  const airiClient = new Client({
    name: config.airi.clientName,
    url: config.airi.wsBaseUrl,
    possibleEvents: ['module:configure', 'module:announced', 'spark:command', 'context:update'],
    autoConnect: false,
    onError: error => airiConnectionLifecycle?.reportUnavailable(error),
    onClose: () => airiConnectionLifecycle?.reportDisconnected(),
  })
  airiConnectionLifecycle = startAiriClientConnection(airiClient, {
    logger,
    url: config.airi.wsBaseUrl,
  })

  let activeRuntime: MinecraftBotRuntime | null = null
  let viewerInitialized = false

  async function createManagedBot(botConfig: typeof config.bot) {
    const runtime = new MinecraftBotRuntime({
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

    await runtime.initialize()
    activeRuntime = runtime

    return runtime
  }

  async function ensureManagedBot() {
    if (activeRuntime)
      return

    await createManagedBot(runtimeSnapshot.effectiveBotConfig)
  }

  async function applyConfiguredRuntime(nextConfig: unknown) {
    runtimeSnapshot = configManager.save(nextConfig as Parameters<MinecraftRuntimeConfigManager['save']>[0])

    if (!runtimeSnapshot.editableConfig.enabled) {
      if (activeRuntime) {
        await activeRuntime.stop()
        activeRuntime = null
      }
      return
    }

    if (!activeRuntime) {
      await ensureManagedBot()
      return
    }

    await activeRuntime.updateBotConfig(runtimeSnapshot.effectiveBotConfig)
  }

  airiClient.onEvent('module:configure', async (event) => {
    try {
      await applyConfiguredRuntime(event.data.config)
    }
    catch {
      // Keep failures local to the service process. Stage learns only from registry liveness
      // and explicit bot-originated context pushes, not automated configure updates.
    }
  })

  if (runtimeSnapshot.editableConfig.enabled) {
    await ensureManagedBot()
  }

  process.on('SIGINT', () => {
    Promise.resolve(activeRuntime?.stop())
      .catch((err: Error) => {
        logger.errorWithError('Failed to stop Minecraft runtime cleanly', err)
      })
      .finally(() => {
        // TODO: Add an explicit AIRI-side deregistration path on shutdown instead of relying on
        // websocket close / heartbeat expiry. Right now the Minecraft page can briefly sit in a
        // stale state after the bot exits, which is annoying and easy to misread as still online.
        airiClient.close()
        exit(0)
      })
  })
}

main().catch((err: Error) => {
  useLogger().errorWithError('Fatal error', err)
  exit(1)
})
