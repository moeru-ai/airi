import type { MineflayerPlugin } from '../mineflayer'
import type { LLMAgentOptions, MineflayerWithAgents } from './types'

import { system } from 'neuri/openai'

import { config } from '../../composables/config'
import { useLogger } from '../../utils/logger'
import { ChatMessageHandler } from '../mineflayer'
import { handleChatMessage } from './chat'
import { createAgentContainer } from './container'
import { generateActionAgentPrompt } from './prompt'
import { handleVoiceInput } from './voice'

export function LLMAgent(options: LLMAgentOptions): MineflayerPlugin {
  return {
    async created(bot) {
      const logger = useLogger()

      // Create container and get required services
      const container = createAgentContainer({
        neuri: options.agent,
        model: config.openai.model,
      })

      const actionAgent = container.resolve('actionAgent')
      const planningAgent = container.resolve('planningAgent')
      const chatAgent = container.resolve('chatAgent')

      // Initialize agents
      await actionAgent.init()
      await planningAgent.init()
      await chatAgent.init()

      // Type conversion
      const botWithAgents = bot as unknown as MineflayerWithAgents
      botWithAgents.action = actionAgent
      botWithAgents.planning = planningAgent
      botWithAgents.chat = chatAgent

      // Initialize system prompt
      bot.memory.chatHistory.push(system(generateActionAgentPrompt(bot)))

      // Set message handling
      const onChat = new ChatMessageHandler(bot.username).handleChat((username, message) =>
        handleChatMessage(username, message, botWithAgents, options.agent, logger))

      options.airiClient.onEvent('input:text:voice', event =>
        handleVoiceInput(event, botWithAgents, options.agent, logger))

      bot.bot.on('chat', onChat)
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
