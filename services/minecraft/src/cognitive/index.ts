import type { MineflayerPlugin } from '../libs/mineflayer'
import type { CognitiveEngineOptions, MineflayerWithAgents } from './types'

import { config } from '../composables/config'
import { DebugService } from '../debug'
import { ChatMessageHandler } from '../libs/mineflayer'
import { createAgentContainer } from './container'
import { createPerceptionFrameFromChat } from './perception/frame'
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
      const eventManager = container.resolve('eventManager')
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

        // Ensure RuleEngine is instantiated (Awilix is lazy). It subscribes to raw:* during construction init.
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

        // Resolve EventBus and subscribe to forward events to debug timeline
        const eventBus = container.resolve('eventBus')

        // Bridge selected EventBus signals into EventManager perception stream for Brain.
        eventBus.subscribe('signal:social_presence', (event) => {
          eventManager.emit({
            type: 'perception',
            payload: event.payload as any,
            source: { type: 'minecraft', id: 'eventBus' },
            timestamp: Date.now(),
          })
        })

        eventBus.subscribe('*', (event) => {
          // Forward to debug service for timeline visualization
          DebugService.getInstance().emitTrace({
            id: event.id,
            traceId: event.traceId,
            parentId: event.parentId,
            type: event.type,
            payload: event.payload,
            timestamp: event.timestamp,
            source: event.source,
          })
        })

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
