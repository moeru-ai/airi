import type { MineflayerPlugin } from '../libs/mineflayer'
import type { CognitiveEngineOptions, MineflayerWithAgents } from './types'

import { config } from '../composables/config'
import { ChatMessageHandler } from '../libs/mineflayer'
import { createAgentContainer } from './container'
import { computeNearbyPlayerGaze } from './reflex/gaze'

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
      botWithAgents.reflexManager = reflexManager

      const startCognitive = () => {
        if (started)
          return
        started = true

        // Initialize layers
        reflexManager.init(botWithAgents)
        brain.init(botWithAgents)

        // Ensure perception rules engine is instantiated (Awilix is lazy).
        void container.resolve('ruleEngine')

        // Initialize perception pipeline (raw events + detectors)
        perceptionPipeline.init(botWithAgents)

        let tickCount = 0
        bot.onTick('tick', () => {
          tickCount++
          if (tickCount % 5 !== 0)
            return

          const gaze = computeNearbyPlayerGaze(bot.bot, { maxDistance: 32, nearbyDistance: 16 })
          reflexManager.updateEnvironment({
            nearbyPlayersGaze: gaze.map(g => ({
              name: g.playerName,
              distanceToSelf: g.distanceToSelf,
              lookPoint: g.lookPoint,
              hitBlock: g.hitBlock,
            })),
          })
        })

        // Resolve EventBus for message handling
        const eventBus = container.resolve('eventBus')

        // NOTICE: EventBus trace forwarding disabled - trace logs removed to reduce noise
        // All events from EventBus were being forwarded to DebugService as trace events,
        // causing thousands of 'raw:sighted:entity_moved' entries in the logs.
        // Conscious layer (LLM) events are still logged separately.

        // Set message handling via EventBus
        const chatHandler = new ChatMessageHandler(bot.username)
        bot.bot.on('chat', (username, message) => {
          if (chatHandler.isBotMessage(username))
            return

          // Bridge chat directly into EventBus as a signal so Reflex can react to it.
          eventBus.emit({
            type: 'signal:chat_message',
            payload: Object.freeze({
              type: 'chat_message',
              description: `Chat from ${username}: "${message}"`,
              sourceId: username,
              confidence: 1.0,
              timestamp: Date.now(),
              metadata: {
                username,
                message,
              },
            }),
            source: {
              component: 'perception',
              id: 'chat',
            },
          })

          // Chat is handled via signal:chat_message only; no extra perception emission needed.
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

        const ruleEngine = container.resolve('ruleEngine')
        ruleEngine.destroy()

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
