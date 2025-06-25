import type { Neuri, NeuriContext } from 'neuri'

import type { Logger } from '../../utils/logger'
import type { MineflayerWithAgents } from './types'

import { withRetry } from '@moeru/std'
import { system, user } from 'neuri/openai'

import { handleLLMCompletion } from './completion'
import { generateStatusPrompt } from './prompt'

export async function handleChatMessage(username: string, message: string, bot: MineflayerWithAgents, agent: Neuri, logger: Logger): Promise<void> {
  logger.withFields({ username, message }).log('Chat message received')
  bot.memory.chatHistory.push(user(`${username}: ${message}`))

  logger.log('thinking...')

  try {
    // Create and execute plan
    const plan = await bot.planning.createPlan(message)
    logger.withFields({ plan }).log('Plan created')
    await bot.planning.executePlan(plan)
    logger.log('Plan executed successfully')

    // Generate response
    // TODO: use chat agent and conversion manager
    const statusPrompt = await generateStatusPrompt(bot)
    const content = await agent.handleStateless(
      [...bot.memory.chatHistory, system(statusPrompt)],
      async (c: NeuriContext) => {
        logger.log('handling response...')
        return withRetry<NeuriContext, string>(
          ctx => handleLLMCompletion(ctx, bot, logger),
          {
            retry: 3,
            retryDelay: 1000,
            onError: err => logger.withError(err).log('error occurred'),
          },
        )(c)
      },
    )

    if (content) {
      logger.withFields({ content }).log('responded')
      bot.bot.chat(content)
    }
  }
  catch (error) {
    logger.withError(error).error('Failed to process message')
    bot.bot.chat(
      `Sorry, I encountered an error: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
    )
  }
}
