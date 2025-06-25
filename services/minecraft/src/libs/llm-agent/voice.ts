import type { Neuri, NeuriContext } from 'neuri'

import type { Logger } from '../../utils/logger'
import type { MineflayerWithAgents } from './types'

import { withRetry } from '@moeru/std'
import { system, user } from 'neuri/openai'

import { handleLLMCompletion } from './completion'
import { generateStatusPrompt } from './prompt'

export async function handleVoiceInput(event: any, bot: MineflayerWithAgents, agent: Neuri, logger: Logger): Promise<void> {
  logger
    .withFields({
      user: event.data.discord?.guildMember,
      message: event.data.transcription,
    })
    .log('Chat message received')

  const statusPrompt = await generateStatusPrompt(bot)
  bot.memory.chatHistory.push(system(statusPrompt))
  bot.memory.chatHistory.push(user(`NekoMeowww: ${event.data.transcription}`))

  try {
    // Create and execute plan
    const plan = await bot.planning.createPlan(event.data.transcription)
    logger.withFields({ plan }).log('Plan created')
    await bot.planning.executePlan(plan)
    logger.log('Plan executed successfully')

    // Generate response
    const retryHandler = withRetry<NeuriContext, string>(
      ctx => handleLLMCompletion(ctx, bot, logger),
      {
        retry: 3,
        retryDelay: 1000,
      },
    )

    const content = await agent.handleStateless(
      [...bot.memory.chatHistory, system(statusPrompt)],
      async (c: NeuriContext) => {
        logger.log('thinking...')
        return retryHandler(c)
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
