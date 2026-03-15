import type { Message } from 'grammy/types'

import type { BotContext, ReadUnreadMessagesAction } from '../../../../types'

import { env } from 'node:process'

import { useLogg } from '@guiiai/logg'
import { withRetry } from '@moeru/std'
import { trace } from '@opentelemetry/api'
import { embed } from '@xsai/embed'

import { findLastNMessages, findRelevantMessages } from '../../../../models'
import { chatMessageToOneLine, telegramMessageToOneLine } from '../../../../models/common'
import { actionReadMessages } from '../../../../prompts'

export async function readMessage(
  state: BotContext,
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
  const tracer = trace.getTracer('airi.telegram.bot')

  return await tracer.startActiveSpan('telegram.module.read_message', async (span) => {
    span.setAttribute('telegram.bot.id', botId)

    const lastNMessages = await tracer.startActiveSpan('telegram.module.read_message.find_last_n_messages', async (span) => {
      const res = await findLastNMessages(action.chatId, 30)
      span.end()
      return res
    })
    const lastNMessagesOneliner = lastNMessages.map(msg => chatMessageToOneLine(botId, msg)).join('\n')
    logger.withField('number_of_last_n_messages', lastNMessages.length).log('Successfully found last N messages')

    const unreadMessagesEmbeddingPromises = unreadMessages
      .filter(msg => !!msg.text || !!msg.caption)
      .map(async (msg: Message) => {
        const embeddingResult = await tracer.startActiveSpan('llm.embed.embed_with_retry', async (span) => {
          const res = await withRetry(async () => {
            return await tracer.startActiveSpan('llm.embed.embed', async (span) => {
              span.setAttribute('llm.embed.model', env.EMBEDDING_MODEL!)
              span.setAttribute('llm.embed.messages', msg.text || msg.caption || '')
              span.setAttribute('llm.provider.api_base_url', env.EMBEDDING_API_BASE_URL!)

              const res = await embed({
                baseURL: env.EMBEDDING_API_BASE_URL!,
                apiKey: env.EMBEDDING_API_KEY!,
                model: env.EMBEDDING_MODEL!,
                input: msg.text || msg.caption || '',
                abortSignal: abortController.signal,
              })

              span.end()
              return res
            })
          }, { retry: 5 })()

          span.end()
          return res
        })

        return embeddingResult
      })

    const unreadHistoryMessagesEmbedding = await Promise.all(unreadMessagesEmbeddingPromises)
    logger.withField('number_of_tasks', unreadMessagesEmbeddingPromises.length).log('Successfully embedded unread history messages')

    const unreadHistoryMessages = await Promise.all(state.unreadMessages[action.chatId].map(msg => telegramMessageToOneLine(botId, msg)))
    const unreadHistoryMessageOneliner = unreadHistoryMessages.join('\n')

    const existingKnownMessages = [...unreadMessages.map(msg => msg.message_id.toString()), ...lastNMessages.map(msg => msg.platform_message_id)]
    const relevantChatMessages = await tracer.startActiveSpan('telegram.module.read_message.find_relevant_messages', async (span) => {
      const res = await findRelevantMessages(botId, chatId, unreadHistoryMessagesEmbedding, existingKnownMessages)
      span.setAttribute('telegram.module.read_message.found_relevant_messages', JSON.stringify(res))

      span.end()
      return res
    })
    const relevantChatMessagesOneliner = relevantChatMessages.map(msgs => msgs.join('\n')).join('\n')
    logger.withField('number_of_relevant_chat_messages', relevantChatMessages.length).log('Successfully composed relevant chat messages')

    state.unreadMessages[action.chatId] = []

    span.end()
    return {
      break: true,
      result: await actionReadMessages({
        lastMessages: lastNMessagesOneliner,
        unreadHistoryMessages: unreadHistoryMessageOneliner,
        relevantChatMessages: relevantChatMessagesOneliner,
      }),
    }
  })
}
