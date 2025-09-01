import type { Message } from 'grammy/types'

import type { BotSelf, ReadUnreadMessagesAction } from '../../../../types'

import { env } from 'node:process'

import { useLogg } from '@guiiai/logg'
import { embed } from '@xsai/embed'

import { findLastNMessages, findRelevantMessages } from '../../../../models'
import { chatMessageToOneLine, telegramMessageToOneLine } from '../../../../models/common'
import { actionReadMessages } from '../../../../prompts'

export async function readMessage(
  state: BotSelf,
  botId: string,
  chatId: string,
  action: ReadUnreadMessagesAction,
  unreadMessages: Message[],
  abortController: AbortController,
): Promise<{
  loop?: boolean
  break?: boolean
  result: string
}> {
  const logger = useLogg('readMessage').useGlobalConfig()

  const lastNMessages = await findLastNMessages(action.chatId, 30)
  const lastNMessagesOneliner = lastNMessages.map(msg => chatMessageToOneLine(botId, msg)).join('\n')
  logger.withField('number_of_last_n_messages', lastNMessages.length).log('Successfully found last N messages')

  const unreadMessagesEmbeddingPromises = unreadMessages
    .filter(msg => !!msg.text || !!msg.caption)
    .map(async (msg: Message) => {
      const embeddingResult = await embed({
        baseURL: env.EMBEDDING_API_BASE_URL!,
        apiKey: env.EMBEDDING_API_KEY!,
        model: env.EMBEDDING_MODEL!,
        input: msg.text || msg.caption || '',
        abortSignal: abortController.signal,
      })

      return embeddingResult
    })
  const unreadHistoryMessagesEmbedding = await Promise.all(unreadMessagesEmbeddingPromises)
  logger.withField('number_of_tasks', unreadMessagesEmbeddingPromises.length).log('Successfully embedded unread history messages')

  const unreadHistoryMessages = await Promise.all(state.unreadMessages[action.chatId].map(msg => telegramMessageToOneLine(botId, msg)))
  const unreadHistoryMessageOneliner = unreadHistoryMessages.join('\n')

  const existingKnownMessages = [...unreadMessages.map(msg => msg.message_id.toString()), ...lastNMessages.map(msg => msg.platform_message_id)]
  const relevantChatMessages = await findRelevantMessages(botId, chatId, unreadHistoryMessagesEmbedding, existingKnownMessages)
  const relevantChatMessagesOneliner = relevantChatMessages.map(msgs => msgs.join('\n')).join('\n')
  logger.withField('number_of_relevant_chat_messages', relevantChatMessages.length).log('Successfully composed relevant chat messages')

  state.unreadMessages[action.chatId] = []

  return {
    break: true,
    result: await actionReadMessages({
      lastMessages: lastNMessagesOneliner,
      unreadHistoryMessages: unreadHistoryMessageOneliner,
      relevantChatMessages: relevantChatMessagesOneliner,
    }),
  }
}
