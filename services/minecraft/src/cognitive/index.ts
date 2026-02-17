import type { MineflayerPlugin } from '../libs/mineflayer'
import type { CognitiveEngineOptions, MineflayerWithAgents } from './types'

import { DebugService } from '../debug'
import { McpReplServer } from '../debug/mcp-repl-server'
import { ChatMessageHandler } from '../libs/mineflayer'
import { createAgentContainer } from './container'

export function CognitiveEngine(options: CognitiveEngineOptions): MineflayerPlugin {
  let container: ReturnType<typeof createAgentContainer>
  let spawnHandler: (() => void) | null = null
  let mcpReplServer: McpReplServer | null = null
  let started = false

  // Keep airiClient reference for future use
  void options.airiClient

  return {
    async created(bot) {
      // Create container and get required services
      container = createAgentContainer()

      const perceptionPipeline = container.resolve('perceptionPipeline')
      const brain = container.resolve('brain')
      const reflexManager = container.resolve('reflexManager')
      const taskExecutor = container.resolve('taskExecutor')
      const debugService = DebugService.getInstance()
      mcpReplServer = new McpReplServer(brain)
      mcpReplServer.start()

      debugService.onCommand('request_repl_state', () => {
        debugService.emit('debug:repl_state', brain.getReplState())
      })

      debugService.onCommand('request_conversation', () => {
        brain.broadcastConversationState()
      })

      debugService.onCommand('execute_repl', async (command) => {
        if (command.type !== 'execute_repl')
          return

        const code = command.payload?.code
        if (typeof code !== 'string') {
          debugService.emit('debug:repl_result', {
            source: 'manual',
            code: '',
            logs: [],
            actions: [],
            error: 'Invalid REPL request: code must be a string',
            durationMs: 0,
            timestamp: Date.now(),
          })
          return
        }

        const result = await brain.executeDebugRepl(code)
        debugService.emit('debug:repl_result', result)
      })

      // Initialize task executor with mineflayer instance
      taskExecutor.setMineflayer(bot)
      await taskExecutor.initialize()

      // Type conversion
      const botWithAgents = bot as unknown as MineflayerWithAgents
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

          // Other periodic updates can go here
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

          if (message.trim().toLowerCase() === '!pause') {
            const paused = brain.togglePaused()
            bot.bot.chat(`[debug] Cognitive engine ${paused ? 'paused' : 'resumed'} (by ${username}).`)
            return
          }

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
      if (mcpReplServer) {
        mcpReplServer.stop()
        mcpReplServer = null
      }

      if (container) {
        const brain = container.resolve('brain')
        brain.destroy()

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
