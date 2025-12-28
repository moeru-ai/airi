import type { MineflayerPlugin } from '../libs/mineflayer'
import type { LLMAgentOptions, MineflayerWithAgents } from './types'

import { system } from 'neuri/openai'

import { config } from '../composables/config'
import { ChatMessageHandler } from '../libs/mineflayer'
import { generateActionAgentPrompt } from './conscious/prompt'
import { createAgentContainer } from './container'

export function LLMAgent(options: LLMAgentOptions): MineflayerPlugin {
  return {
    async created(bot) {
      // Create container and get required services
      const container = createAgentContainer({
        neuri: options.agent,
        model: config.openai.model,
      })

      const actionAgent = container.resolve('actionAgent')
      const planningAgent = container.resolve('planningAgent')
      const chatAgent = container.resolve('chatAgent')
      const eventManager = container.resolve('eventManager')
      const orchestrator = container.resolve('orchestrator')
      const reflexManager = container.resolve('reflexManager')

      // Initialize agents
      await actionAgent.init()
      await planningAgent.init()
      await chatAgent.init()

      // Type conversion
      const botWithAgents = bot as unknown as MineflayerWithAgents
      botWithAgents.action = actionAgent
      botWithAgents.planning = planningAgent
      botWithAgents.chat = chatAgent

      // Initialize layers
      reflexManager.init(botWithAgents)
      orchestrator.init(botWithAgents)

      // Initialize system prompt
      bot.memory.chatHistory.push(system(generateActionAgentPrompt(bot)))

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
      await botWithAgents.planning?.destroy()
      await botWithAgents.chat?.destroy()
      bot.bot.removeAllListeners('chat')
    },
  }
}
