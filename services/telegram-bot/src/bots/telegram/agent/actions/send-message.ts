import type { GenerateTextOptions } from '@xsai/generate-text'
import type { Message } from 'grammy/types'

import type { BotContext, ChatContext } from '../../../../types'

import { env } from 'node:process'

import { useLogg } from '@guiiai/logg'
import { sleep } from '@moeru/std'
import { generateText } from '@xsai/generate-text'
import { message } from '@xsai/utils-chat'
import { parse } from 'best-effort-json-parser'
import { randomInt } from 'es-toolkit'

import { embedContent, findLastNMessages, mergeOrCreateLongTermMemory, recordMessage } from '../../../../models'
import { listJoinedChats } from '../../../../models/chats'
import { chatMessageToOneLine } from '../../../../models/common'
import { extractLongTermMemories, messageSplit } from '../../../../prompts'
import { addStep } from '../../../../utils/debug-tracker'
import { cancellable } from '../../../../utils/promise'

export function parseMayStructuredMessage(responseText: string) {
  const logger = useLogg('parseMayStructuredMessage').useGlobalConfig()

  // eslint-disable-next-line regexp/no-super-linear-backtracking, regexp/optimal-quantifier-concatenation
  const result = /^\{(("?)*.*\s*)*\}$/mu.exec(responseText)
  if (result) {
    logger.withField('text', JSON.stringify(responseText)).withField('result', result).log('Multiple messages detected')

    const parsedResponse = parse(result[0]) as ({ messages?: unknown, reply_to_message_id?: unknown } | undefined)
    const messages = Array.isArray(parsedResponse?.messages)
      ? parsedResponse.messages.filter((message): message is string => typeof message === 'string' && message.trim() !== '')
      : []
    const replyToMessageId = typeof parsedResponse?.reply_to_message_id === 'string'
      ? parsedResponse.reply_to_message_id
      : undefined

    if (messages.length > 0) {
      return { messages, reply_to_message_id: replyToMessageId }
    }

    return { messages: [responseText], reply_to_message_id: replyToMessageId }
  }

  return { messages: [responseText], reply_to_message_id: undefined }
}

export async function sendMessage(
  botContext: BotContext,
  chatContext: ChatContext,
  responseText: string,
  groupId: string,
  abortController: AbortController,
) {
  const logger = useLogg('imagineAnAction').useGlobalConfig()

  const chat = (await listJoinedChats()).find((chat) => {
    return chat.chat_id === groupId
  })
  botContext.logger.withField('chat', chat).log('Chat found')
  if (!chat) {
    botContext.logger.withField('groupId', groupId).log('Chat not found')
    return
  }

  const chatId = chat.chat_id

  // Cancel any existing task before starting a new one
  if (chatContext.currentTask) {
    chatContext.currentTask.cancel()
    chatContext.currentTask = null
  }

  // Note: removed "new messages arrived" check — it was preventing the bot
  // from ever responding in fast-paced chats. The agent loop handles new messages naturally.

  const systemContent = String(await messageSplit())
  const req = {
    apiKey: env.LLM_API_KEY!,
    baseURL: env.LLM_API_BASE_URL!,
    model: env.LLM_MODEL!,
    messages: message.messages(
      { role: 'system' as const, content: systemContent },
      { role: 'user' as const, content: 'This is the input message:' },
      { role: 'user' as const, content: String(responseText) },
    ),
    abortSignal: abortController.signal,
  } satisfies GenerateTextOptions
  if (env.LLM_OLLAMA_DISABLE_THINK) {
    (req as Record<string, unknown>).think = false
  }

  const res = await generateText(req)
  res.text = res.text
    .replace(/<think>[\s\S]*?<\/think>/, '')
    .replace(/^```json\s*\n/, '')
    .replace(/\n```$/, '')
    .replace(/^```\s*\n/, '')
    .replace(/\n```$/, '')
    .trim()
  if (!res.text) {
    throw new Error('No response text')
  }

  addStep('sendMessage:messageSplit', {
    inputLength: responseText.length,
    outputLength: res.text.length,
    totalTokens: res.usage.total_tokens,
    promptTokens: res.usage.prompt_tokens,
    completionTokens: res.usage.completion_tokens,
  })

  logger.withFields({
    messages: responseText,
    response: res.text,
    now: new Date().toLocaleString(),
    totalTokens: res.usage.total_tokens,
    promptTokens: res.usage.prompt_tokens,
    completion_tokens: res.usage.completion_tokens,
  }).log('Message split')

  const structuredMessage = parseMayStructuredMessage(res.text)
  if (structuredMessage == null) {
    botContext.logger.log(`Not sending message to ${chatId} - no messages to send`)
    return
  }

  addStep('sendMessage:structured', {
    messageCount: structuredMessage.messages.length,
    hasReplyTo: !!structuredMessage.reply_to_message_id,
    messages: structuredMessage.messages.map(m => m.slice(0, 100)),
  })

  botContext.logger.withField('texts', structuredMessage).log('Sending messages')

  // If we get here, the task wasn't cancelled, so we can send the response
  for (let i = 0; i < structuredMessage.messages.length; i++) {
    const item = structuredMessage.messages[i]
    if (!item) {
      botContext.logger.log(`Not sending message to ${chatId} - no messages to send`)
      continue
    }

    // Create cancellable typing and reply tasks
    try {
      await botContext.bot.api.sendChatAction(chatId, 'typing')
    }
    catch {

    }
    await sleep(item.length * 50)

    const replyTask = cancellable((async (): Promise<Message.TextMessage> => {
      try {
        const validReplyToMessageId = structuredMessage.reply_to_message_id ? Number.parseInt(structuredMessage.reply_to_message_id) : undefined

        if (i === 0 && validReplyToMessageId && !Number.isNaN(validReplyToMessageId)) {
          const sentResult = await botContext.bot.api.sendMessage(chatId, item, { reply_parameters: { message_id: validReplyToMessageId } })
          return sentResult
        }
        else {
          const sentResult = await botContext.bot.api.sendMessage(chatId, item)
          return sentResult
        }
      }
      catch (err) {
        botContext.logger.withError(err).log('Failed to send message')
        throw err
      }
    })())

    chatContext.currentTask = replyTask
    const msg = await replyTask.promise
    await recordMessage(botContext.bot.botInfo, msg)
    await sleep(randomInt(50, 1000))
  }

  chatContext.currentTask = null

  // Async: extract long-term memories from this conversation turn (non-blocking)
  const botId = botContext.bot.botInfo.id.toString()
  extractAndStoreMemories(botContext, botId, groupId).catch((err) => {
    botContext.logger.withError(err).log('Failed to extract long-term memories (async)')
  })
}

async function extractAndStoreMemories(
  botContext: BotContext,
  botId: string,
  chatId: string,
): Promise<void> {
  const logger = useLogg('extractAndStoreMemories').useGlobalConfig()

  // Fetch recent conversation from DB (includes both user messages and bot replies)
  const recentMessages = await findLastNMessages(chatId, 15)
  if (recentMessages.length === 0) {
    logger.log('No recent messages to extract memories from')
    return
  }

  const conversationContext = recentMessages
    .map(msg => chatMessageToOneLine(botId, msg))
    .join('\n')

  const promptResult = await extractLongTermMemories({ conversationContext })
  const systemContent = String(promptResult)

  const res = await generateText({
    apiKey: env.LLM_API_KEY!,
    baseURL: env.LLM_API_BASE_URL!,
    model: env.LLM_MODEL!,
    messages: [
      { role: 'system' as const, content: systemContent },
      { role: 'user' as const, content: 'Extract memories from the conversation above. Respond with JSON array only.' },
    ],
  })

  const text = res.text
    .replace(/<think>[\s\S]*?<\/think>/, '')
    .replace(/^```json\s*\n/, '')
    .replace(/\n```$/, '')
    .trim()

  if (!text || text === '[]') {
    logger.log('No memories to extract')
    return
  }

  let memories: { content: string, category: string, importance: number }[]
  try {
    memories = parse(text) as { content: string, category: string, importance: number }[]
    if (!Array.isArray(memories)) {
      logger.log('Extracted memories is not an array, skipping')
      return
    }
  }
  catch {
    logger.withField('text', text).log('Failed to parse extracted memories')
    return
  }

  addStep('extractMemories:parsed', {
    memoriesFound: memories.length,
    categories: memories.map(m => m.category),
  })

  for (const mem of memories) {
    if (!mem.content || !mem.category)
      continue

    try {
      const embedding = await embedContent(mem.content)
      const result = await mergeOrCreateLongTermMemory({
        content: mem.content,
        category: mem.category,
        importance: mem.importance || 5,
        embedding,
        metadata: {
          platform: 'telegram',
          botId: botContext.bot.botInfo.id.toString(),
          chatId,
          sourceMessageIds: [],
          sourceType: 'conversation',
          extractedAt: Date.now(),
        },
      })
      logger.withFields({ action: result.action, id: result.id, content: mem.content }).log('Stored memory')
    }
    catch (err) {
      logger.withError(err).withField('content', mem.content).log('Failed to store memory')
    }
  }
}
