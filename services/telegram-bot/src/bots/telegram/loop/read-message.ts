import type { Message } from 'grammy/types'
import type { BotSelf, ReadMessagesAction } from '../../../types'

import { env } from 'node:process'
import { useLogg } from '@guiiai/logg'
import { embed } from '@xsai/embed'

import { findLastNMessages, findRelevantMessages } from '../../../models'
import { chatMessageToOneLine, telegramMessageToOneLine } from '../../../models/common'

export async function readMessage(
  state: BotSelf,
  botId: string,
  chatId: string,
  action: ReadMessagesAction,
  unreadMessages: Message[],
  abortController: AbortController,
): Promise<{
    loop?: boolean
    break?: boolean
    result: string
  }> {
  const logger = useLogg('readMessage').useGlobalConfig()

  const lastNMessages = await findLastNMessages(action.chatId, 100)
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
  const relevantChatMessagesOneliner = relevantChatMessages.map(async msgs => msgs.join('\n')).join('\n')
  logger.withField('number_of_relevant_chat_messages', relevantChatMessages.length).log('Successfully composed relevant chat messages')

  state.unreadMessages[action.chatId] = []

  return {
    break: true,
    result: ''
      + 'You choose to read the messages from the group (perhaps you are already engaging the topics in the group).'
      + 'Imaging you are using Telegram app on the mobile phone, and you are reading the messages from the group chat.'
      + '\n'
      + 'Previous 30 messages (including what you said):\n'
      + `${lastNMessagesOneliner || 'No messages'}`
      + '\n'
      + 'All the messages you requested to read:\n'
      + `${unreadHistoryMessageOneliner || 'No messages'}`
      + '\n'
      + 'Relevant chat messages may help you recall the memories:\n'
      + `${relevantChatMessagesOneliner || 'No relevant messages'}`
      + '\n',
  }
}
