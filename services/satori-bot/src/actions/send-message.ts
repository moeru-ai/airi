import type { SatoriClient } from '../client/satori-client'
import type { BotContext, ChatContext } from '../types/bot'

import { useLogg } from '@guiiai/logg'

import { recordMessage } from '../db'

export async function sendMessage(
  botContext: BotContext,
  chatContext: ChatContext,
  satoriClient: SatoriClient,
  content: string,
  channelId: string,
  _abortController: AbortController,
) {
  const logger = useLogg('sendMessage').useGlobalConfig()

  try {
    // Check if we should abort due to new messages
    if (botContext.unreadMessages[channelId] && botContext.unreadMessages[channelId].length > 0) {
      logger.log(`Not sending message to ${channelId} - new messages arrived`)
      return
    }

    // Send the message
    logger.withField('channelId', channelId).withField('content', content).log('Sending message')

    await satoriClient.sendMessage(chatContext.platform, chatContext.selfId, channelId, content)

    // Record the message in database
    await recordMessage(channelId, 'bot', 'AIRI', content)

    // Add to chat context as assistant message
    chatContext.messages.push({
      role: 'assistant',
      content,
    })

    logger.log('Message sent successfully')
  }
  catch (err) {
    if ((err as Error).name === 'AbortError') {
      logger.log('Message sending was aborted')
      return
    }

    logger.withError(err as Error).log('Failed to send message')
    throw err
  }
}
