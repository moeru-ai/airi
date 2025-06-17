import type { Message } from 'grammy/types'

import type { BotSelf } from '../../../types'

import { useLogg } from '@guiiai/logg'
import { parse } from 'best-effort-json-parser'
import { randomInt } from 'es-toolkit'

import { recordMessage } from '../../../models'
import { listJoinedChats } from '../../../models/chats'
import { cancellable, sleep } from '../../../utils/promise'

export function parseMayStructuredMessage(responseText: string) {
  const logger = useLogg('parseMayStructuredMessage').useGlobalConfig()

  // eslint-disable-next-line regexp/no-super-linear-backtracking, regexp/optimal-quantifier-concatenation
  const result = /^\{(("?)*.*\s*)*\}$/u.exec(responseText)
  if (result) {
    logger.withField('text', JSON.stringify(responseText)).withField('result', result).log('Multiple messages detected')

    const parsedResponse = parse(result?.[0]) as ({ messages?: string[], reply_to_message_id?: string } | undefined)
    parsedResponse.messages = parsedResponse.messages?.filter(message => message.trim() !== '')

    return parsedResponse
  }

  return { messages: [responseText], reply_to_message_id: undefined }
}

export async function sendMayStructuredMessage(
  state: BotSelf,
  responseText: string,
  groupId: string,
) {
  const chat = (await listJoinedChats()).find((chat) => {
    return chat.chat_id === groupId
  })
  state.logger.withField('chat', chat).log('Chat found')
  if (!chat) {
    state.logger.withField('groupId', groupId).log('Chat not found')
    return
  }

  const chatId = chat.chat_id

  // Cancel any existing task before starting a new one
  if (state.currentTask) {
    state.currentTask.cancel()
    state.currentTask = null
  }

  // Check if we should abort due to new messages since processing began
  if (state.unreadMessages[chatId] && state.unreadMessages[chatId].length > 0) {
    state.logger.log(`Not sending message to ${chatId} - new messages arrived`)
    return // Don't send the message, let the next processing loop handle it
  }

  const structuredMessage = parseMayStructuredMessage(responseText)
  if (structuredMessage == null) {
    state.logger.log(`Not sending message to ${chatId} - no messages to send`)
    return
  }

  state.logger.withField('texts', structuredMessage).log('Sending messages')

  // If we get here, the task wasn't cancelled, so we can send the response
  for (let i = 0; i < structuredMessage.messages.length; i++) {
    const item = structuredMessage.messages[i]
    if (!item) {
      state.logger.log(`Not sending message to ${chatId} - no messages to send`)
      continue
    }

    // Create cancellable typing and reply tasks
    await state.bot.api.sendChatAction(chatId, 'typing')
    await sleep(item.length * 50)

    const replyTask = cancellable((async (): Promise<Message.TextMessage> => {
      try {
        const validReplyToMessageId = structuredMessage.reply_to_message_id ? Number.parseInt(structuredMessage.reply_to_message_id) : undefined

        if (i === 0 && validReplyToMessageId && !Number.isNaN(validReplyToMessageId)) {
          const sentResult = await state.bot.api.sendMessage(chatId, item, { reply_parameters: { message_id: validReplyToMessageId } })
          return sentResult
        }
        else {
          const sentResult = await state.bot.api.sendMessage(chatId, item)
          return sentResult
        }
      }
      catch (err) {
        state.logger.withError(err).log('Failed to send message')
        throw err
      }
    })())

    state.currentTask = replyTask
    const msg = await replyTask.promise
    await recordMessage(state.bot.botInfo, msg)
    await sleep(randomInt(50, 1000))
  }

  state.currentTask = null
}
