import process, { exit } from 'node:process'

import MineflayerArmorManager from 'mineflayer-armor-manager'

import { Client } from '@proj-airi/server-sdk'
import { loader as MineflayerAutoEat } from 'mineflayer-auto-eat'
import { plugin as MineflayerCollectBlock } from 'mineflayer-collectblock'
import { pathfinder as MineflayerPathfinder } from 'mineflayer-pathfinder'
import { plugin as MineflayerPVP } from 'mineflayer-pvp'
import { plugin as MineflayerTool } from 'mineflayer-tool'

import { CognitiveEngine } from './cognitive'
import { initBot } from './composables/bot'
import { config, initEnv } from './composables/config'
import { DebugService } from './debug'
import { setupMineflayerViewer } from './debug/mineflayer-viewer'
import { wrapPlugin } from './libs/mineflayer'
import { initLogger, useLogger } from './utils/logger'

// ...

async function main() {
  initLogger() // todo: save logs to file
  initEnv()

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

  const { bot } = await initBot({
    botConfig: config.bot,
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

  if (config.debug.viewer) {
    setupMineflayerViewer(bot, { port: 3007, firstPerson: true })
  }

  // Connect airi server
  const airiClient = new Client({
    name: config.airi.clientName,
    url: config.airi.wsBaseUrl,
  })

  // Load CognitiveEngine (LLM config is read from config internally)
  await bot.loadPlugin(CognitiveEngine({ airiClient }))

  // Setup Tool Executor for Debug Dashboard
  const { setupToolExecutor } = await import('./debug/tool-executor')
  setupToolExecutor(bot)

  process.on('SIGINT', () => {
    bot.stop()
    exit(0)
  })
}

main().catch((err: Error) => {
  useLogger().errorWithError('Fatal error', err)
  exit(1)
})
