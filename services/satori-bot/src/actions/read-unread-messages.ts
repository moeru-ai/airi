import type { BotContext, ChatContext, ReadUnreadMessagesAction } from '../types/bot'
import type { SatoriMessage } from '../types/satori'

import { useLogg } from '@guiiai/logg'

export async function readUnreadMessages(
  botContext: BotContext,
  chatContext: ChatContext,
  action: ReadUnreadMessagesAction,
): Promise<{ result: string } | undefined> {
  const logger = useLogg('readUnreadMessages').useGlobalConfig()

  if (Object.keys(botContext.unreadMessages).length === 0) {
    logger.log('No unread messages - clearing unread messages')
    botContext.unreadMessages = {}
    return undefined
  }

  if (!action.channelId) {
    logger.warn('No channel ID provided - clearing all unread messages')
    return undefined
  }

  let unreadMessagesForThisChannel: SatoriMessage[] | undefined = botContext.unreadMessages[action.channelId]

  if (!Array.isArray(unreadMessagesForThisChannel)) {
    logger.log('Unread messages for channel is not an array - converting to array')
    unreadMessagesForThisChannel = []
  }

  if (unreadMessagesForThisChannel.length === 0) {
    logger.log('No unread messages for channel - deleting')
    delete botContext.unreadMessages[action.channelId]
    return undefined
  }

  // Format messages for LLM context
  const formattedMessages = unreadMessagesForThisChannel.map((msg) => {
    const userName = msg.user?.name || msg.user?.id || 'Unknown'
    const content = msg.content || '[No content]'
    return `[${userName}]: ${content}`
  }).join('\n')

  // Clear the unread messages for this channel
  delete botContext.unreadMessages[action.channelId]

  logger.log(`Read ${unreadMessagesForThisChannel.length} unread messages from channel ${action.channelId}`)

  return {
    result: `AIRI System: Read ${unreadMessagesForThisChannel.length} unread messages from channel ${action.channelId}:\n${formattedMessages}`,
  }
}
