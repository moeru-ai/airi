import type { NeuriContext } from 'neuri'
import type { ChatCompletion } from 'neuri/openai'

import type { Logger } from '../../utils/logger'
import type { MineflayerWithAgents } from './types'

import { assistant } from 'neuri/openai'

import { config } from '../../composables/config'

export async function handleLLMCompletion(context: NeuriContext, bot: MineflayerWithAgents, logger: Logger): Promise<string> {
  logger.log('rerouting...')

  const completion = await context.reroute('action', context.messages, {
    model: config.openai.model,
  }) as ChatCompletion | { error: { message: string } } & ChatCompletion

  if (!completion || 'error' in completion) {
    logger.withFields({ completion }).error('Completion')
    logger.withFields({ messages: context.messages }).log('messages')
    return completion?.error?.message ?? 'Unknown error'
  }

  const content = await completion.firstContent()
  logger.withFields({ usage: completion.usage, content }).log('output')

  bot.memory.chatHistory.push(assistant(content))
  return content
}
