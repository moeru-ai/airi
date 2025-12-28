import type { MineflayerPlugin } from '../libs/mineflayer'
import type { LLMAgentOptions, MineflayerWithAgents } from './types'

import { config } from '../composables/config'
import { ChatMessageHandler } from '../libs/mineflayer'
import { createAgentContainer } from './container'

export function LLMAgent(options: LLMAgentOptions): MineflayerPlugin {
  let container: ReturnType<typeof createAgentContainer>

  return {
    async created(bot) {
      // Create container and get required services
      container = createAgentContainer({
        neuri: options.agent,
        model: config.openai.model,
      })

      const actionAgent = container.resolve('actionAgent')
      const chatAgent = container.resolve('chatAgent')
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

      // Initialize layers
      reflexManager.init(botWithAgents)
      brain.init(botWithAgents)

      // Set message handling via EventManager
      const chatHandler = new ChatMessageHandler(bot.username)
      bot.bot.on('chat', (username, message) => {
        if (chatHandler.isBotMessage(username))
          return

        eventManager.emit({
          type: 'user_intent',
          payload: {
            content: message,
            metadata: {
              displayName: username,
            },
          },
          source: {
            type: 'minecraft',
            id: username,
          },
          timestamp: Date.now(),
        })
      })

      options.airiClient.onEvent('input:text:voice', (event) => {
        eventManager.emit({
          type: 'user_intent',
          payload: {
            content: event.data.transcription,
            metadata: {
              displayName: (event.data.discord?.guildMember as any)?.nick || (event.data.discord?.guildMember as any)?.user?.username || 'Voice User',
            },
          },
          source: {
            type: 'airi',
            id: (event.data.discord?.guildMember as any)?.user?.id || 'unknown',
            reply: (msg) => {
              // TODO: implement Airi voice reply if needed, or just chat in MC
              bot.bot.chat(msg)
            },
          },
          timestamp: Date.now(),
        })
      })
    },

    async beforeCleanup(bot) {
      const botWithAgents = bot as unknown as MineflayerWithAgents
      await botWithAgents.action?.destroy()
      await botWithAgents.chat?.destroy()

      if (container) {
        const taskExecutor = container.resolve('taskExecutor')
        await taskExecutor.destroy()
      }

      bot.bot.removeAllListeners('chat')
    },
  }
}
