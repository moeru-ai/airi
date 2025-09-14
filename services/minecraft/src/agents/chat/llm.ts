import type { Agent, Neuri } from 'neuri'

import type { ChatHistory } from './types'

import { withRetry } from '@moeru/std'
import { agent } from 'neuri'
import { system, user } from 'neuri/openai'

import { config as appConfig } from '../../composables/config'
import { useLogger } from '../../utils/logger'
import { generateChatAgentPrompt } from './adapter'

interface LLMChatConfig {
  agent: Neuri
  model?: string
  retryLimit?: number
  delayInterval?: number
  maxContextLength?: number
}

export async function createChatNeuriAgent(): Promise<Agent> {
  return agent('chat').build()
}

export async function generateChatResponse(
  message: string,
  history: ChatHistory[],
  config: LLMChatConfig,
): Promise<string> {
  const systemPrompt = generateChatAgentPrompt()
  const chatHistory = formatChatHistory(history, config.maxContextLength ?? 10)
  const userPrompt = message
  const logger = useLogger()

  const messages = [
    system(systemPrompt),
    ...chatHistory,
    user(userPrompt),
  ]

  const content = await config.agent.handleStateless(messages, async (c) => {
    logger.log('Generating response...')

    const handleCompletion = async (c: any): Promise<string> => {
      const completion = await c.reroute('chat', c.messages, {
        model: config.model ?? appConfig.openai.model,
      })

      if (!completion || 'error' in completion) {
        logger.withFields(c).error('Completion failed')
        throw new Error(completion?.error?.message ?? 'Unknown error')
      }

      const content = await completion.firstContent()
      logger.withFields({ usage: completion.usage, content }).log('Response generated')
      return content
    }

    const retryHandler = withRetry<any, string>(handleCompletion, {
      retry: config.retryLimit ?? 3,
      retryDelay: config.delayInterval ?? 1000,
    })

    return await retryHandler(c)
  })

  if (!content) {
    throw new Error('Failed to generate response')
  }

  return content
}

function formatChatHistory(
  history: ChatHistory[],
  maxLength: number,
): Array<{ role: 'user' | 'assistant', content: string }> {
  // Take the most recent messages up to maxLength
  const recentHistory = history.slice(-maxLength)

  return recentHistory.map(entry => ({
    role: entry.sender === 'bot' ? 'assistant' : 'user',
    content: entry.message,
  }))
}
