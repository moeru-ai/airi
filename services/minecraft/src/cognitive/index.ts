import type { MineflayerPlugin } from '../libs/mineflayer'
import type { CognitiveEngineOptions, MineflayerWithAgents } from './types'

import { config } from '../composables/config'
import { ChatMessageHandler } from '../libs/mineflayer'
import { createAgentContainer } from './container'
import { createPerceptionFrameFromChat } from './perception/frame'

export function CognitiveEngine(options: CognitiveEngineOptions): MineflayerPlugin {
  let container: ReturnType<typeof createAgentContainer>
  let spawnHandler: (() => void) | null = null
  let started = false

  return {
    async created(bot) {
      // Create container and get required services
      container = createAgentContainer({
        neuri: options.agent,
        model: config.openai.model,
      })

      const actionAgent = container.resolve('actionAgent')
      const chatAgent = container.resolve('chatAgent')
      const perceptionPipeline = container.resolve('perceptionPipeline')
      const brain = container.resolve('brain')
      const reflexManager = container.resolve('reflexManager')
      const taskExecutor = container.resolve('taskExecutor')

      // Initialize agents
      await actionAgent.init()
      await chatAgent.init()
      await taskExecutor.initialize()

      // Type conversion
      const botWithAgents = bot as unknown as MineflayerWithAgents
      botWithAgents.action = actionAgent
      botWithAgents.chat = chatAgent

      const startCognitive = () => {
        if (started)
          return
        started = true

        // Initialize layers
        reflexManager.init(botWithAgents)
        brain.init(botWithAgents)

        // Initialize perception pipeline (raw events + detectors)
        perceptionPipeline.init(botWithAgents)

        // Set message handling via EventManager
        const chatHandler = new ChatMessageHandler(bot.username)
        bot.bot.on('chat', (username, message) => {
          if (chatHandler.isBotMessage(username))
            return

          perceptionPipeline.ingest(createPerceptionFrameFromChat(username, message))
        })
      }

      if (bot.bot.entity) {
        startCognitive()
      }
      else {
        spawnHandler = () => startCognitive()
        bot.bot.once('spawn', spawnHandler)
      }
    },

    async beforeCleanup(bot) {
      const botWithAgents = bot as unknown as MineflayerWithAgents
      await botWithAgents.action?.destroy()
      await botWithAgents.chat?.destroy()

      if (container) {
        const taskExecutor = container.resolve('taskExecutor')
        await taskExecutor.destroy()

        const perceptionPipeline = container.resolve('perceptionPipeline')
        perceptionPipeline.destroy()

        const reflexManager = container.resolve('reflexManager')
        reflexManager.destroy()
      }

      if (spawnHandler) {
        bot.bot.off('spawn', spawnHandler)
        spawnHandler = null
      }
      started = false

      bot.bot.removeAllListeners('chat')
    },
  }
}
