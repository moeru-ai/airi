import type { Logg } from '@guiiai/logg'
import type { Message as LLMMessage } from '@xsai/shared-chat'
import type { SQL } from 'drizzle-orm'
import type { Message } from 'grammy/types'
import type { Action, BotSelf, ExtendedContext } from '../../types'

import { env } from 'node:process'
import { useLogg } from '@guiiai/logg'
import { embed } from '@xsai/embed'
import { generateText } from '@xsai/generate-text'
import { message } from '@xsai/utils-chat'
import { parse } from 'best-effort-json-parser'
import { cosineDistance, desc, sql } from 'drizzle-orm'
import { randomInt } from 'es-toolkit'
import { Bot } from 'grammy'

import { useDrizzle } from '../../db'
import { chatMessagesTable } from '../../db/schema'
import { interpretPhotos } from '../../llm/photo'
import { interpretSticker } from '../../llm/sticker'
import { findLastNMessages, recordMessage } from '../../models'
import { listJoinedChats, recordJoinedChat } from '../../models/chats'
import { chatMessageToOneLine, telegramMessageToOneLine } from '../../models/common'
import { consciousnessSystemPrompt, systemPrompt } from '../../prompts/system-v1'
import { cancellable, sleep } from '../../utils/promise'

async function isChatIdBotAdmin(chatId: number) {
  const admins = env.ADMIN_USER_IDS!.split(',')
  return admins.includes(chatId.toString())
}

async function sendMayStructuredMessage(
  state: BotSelf,
  responseText: string,
  groupId: string,
) {
  const chat = (await listJoinedChats()).find((chat) => {
    return chat.chat_id === groupId
  })
  if (!chat) {
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

  // If we get here, the task wasn't cancelled, so we can send the response
  // eslint-disable-next-line regexp/no-unused-capturing-group, regexp/no-super-linear-backtracking, regexp/confusing-quantifier
  if (/\[(\s*.*)+\]/u.test(responseText)) {
    // eslint-disable-next-line regexp/no-super-linear-backtracking, regexp/confusing-quantifier
    const result = /\[(\s*.*)+\]/u.exec(responseText)
    state.logger.withField('text', JSON.stringify(responseText)).withField('result', result).log('Multiple messages detected')

    const array = parse(result?.[0]) as string[]
    if (array == null || !Array.isArray(array) || array.length === 0) {
      state.logger.withField('text', JSON.stringify(responseText)).withField('result', result).log('No messages to send')
      return
    }

    state.logger.withField('texts', array).log('Sending multiple messages...')

    for (const item of array) {
      // Create cancellable typing and reply tasks
      await state.bot.api.sendChatAction(chatId, 'typing')
      await sleep(item.length * 200)

      const replyTask = cancellable((async (): Promise<Message.TextMessage> => {
        try {
          const sentResult = await state.bot.api.sendMessage(chatId, item)
          return sentResult
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
  }
  else if (responseText) {
    await state.bot.api.sendChatAction(chatId, 'typing')
    const replyTask = cancellable((async (): Promise<Message.TextMessage> => {
      try {
        const sentResult = await state.bot.api.sendMessage(chatId, responseText)
        return sentResult
      }
      catch (err) {
        state.logger.withError(err).log('Failed to send message')
        throw err
      }
    })())

    state.currentTask = replyTask
    const msg = await replyTask.promise
    await recordMessage(state.bot.botInfo, msg)
  }

  state.currentTask = null
}

async function handleLoop(state: BotSelf, msgs?: LLMMessage[], forGroupId?: string) {
  const logger = useLogg('handleLoop').useGlobalConfig()

  // Create a new abort controller for this loop execution
  if (state.currentAbortController) {
    state.currentAbortController.abort()
  }
  state.currentAbortController = new AbortController()

  try {
    if (msgs == null) {
      msgs = message.messages(
        message.system(consciousnessSystemPrompt()),
        message.system(
          [
            {
              description: 'List all available chats, best to do before you want to send a message to a chat.',
              example: { action: 'listChats' },
            },
            {
              description: 'Send a message to a specific chat group. If you want to express anything to anyone or your friends in group, you can use this action.',
              example: { action: 'sendMessage', content: '<content>', groupId: 'id of chat to send to' },
            },
            {
              description: 'Read unread messages from a specific chat group. If you want to read the unread messages from a specific chat group, you can use this action.',
              example: { action: 'readMessages', groupId: 'id of chat to send to' },
            },
            {
              description: 'Continue the current task, which means to keep your current state unchanged, I\'ll ask you again in next tick.',
              example: { action: 'continue' },
            },
            {
              description: 'Take a break, which means to clear out ongoing tasks, but keep the short-term memory, and I\'ll ask you again in next tick.',
              example: { action: 'break' },
            },
            {
              description: 'Sleep, which means to clear out ongoing tasks, and clear out the working memory, and I\'ll ask you again in next tick.',
              example: { action: 'sleep' },
            },
            {
              description: 'By giving references to contexts, come up ideas to record in long-term memory.',
              example: { action: 'comeUpIdeas', ideas: ['I want to tell everyone a story of myself', 'I want to google how to make a AI like me'] },
            },
            {
              description: 'By giving references to contexts, come up goals with deadline and priority to record in long-term memory.',
              example: { action: 'comeUpGoals', goals: [{ text: 'Learn to play Minecraft', deadline: '2025-05-01 23:59:59', priority: 6 }, { text: 'Learn anime of this season', deadline: '2025-01-08 23:59:59', priority: 9 }] },
            },
          // { example: { action: 'lookupShortTermMemory', query: '', category: 'chat or self' }, description: 'Look up the short-term, which means to recall the short-term memory from memory component.' },
          // { example: { action: 'lookupLongTermMemory', query: '', category: 'chat or self' }, description: 'Look up the long-term, which means to recall the long-term memory from memory component.' },
          // { example: { action: 'memorizeShortMemory', content: '<content>', tags: ['keyword tag'] }, description: 'Memorize to short-term memory, which means to append things the short-term memory which will be included for a while, but will be eventually forgot.' },
          // { example: { action: 'memorizeLongMemory', content: '<content>', tags: ['keyword tag'] }, description: 'Memorize to long-term memory, which means to append things the long-term memory which will be included for a long time, and hard to forget.' },
          // { example: { action: 'forgetShortTermMemory', where: { id: '<id of memory>' } }, description: 'Remove specific short-term memory entry from the memory component.' },
          // { example: { action: 'forgetLongTermMemory', where: { id: '<id of memory>' } }, description: 'Remove specific long-term memory entry from the memory component.' },
          // { example: { action: 'searchGoogle', query: '<query>' }, description: 'Search Google with the query.' },
          ]
            .map((item, index) => `${index}: ${JSON.stringify(item.example)}: ${item.description}`)
            .join('\n'),
        ),
        message.system(''
          + `Now the time is: ${new Date().toLocaleString()}. `
          + `You have total ${Object.values(state.unreadMessages).reduce((acc, cur) => acc + cur.length, 0)} unread messages.`
          + '\n'
          + 'Unread messages count are:\n'
          + `${Object.entries(state.unreadMessages).map(([key, value]) => `ID:${key}, Unread message count:${value.length}`).join('\n')}`
          + '',
        ),
        message.user('What do you want to do? Respond with the action and parameters you choose in JSON only, without any explanation and markups'),
      )
    }

    const res = await generateText({
      apiKey: env.LLM_API_KEY!,
      baseURL: env.LLM_API_BASE_URL!,
      model: env.LLM_MODEL!,
      messages: msgs,
      abortSignal: state.currentAbortController.signal,
    })

    state.logger.withFields({
      response: res.text,
      unreadMessages: Object.fromEntries(Object.entries(state.unreadMessages).map(([key, value]) => [key, value.length])),
      now: new Date().toLocaleString(),
    }).log('Generated action')

    try {
      res.text = res.text
        .replace(/^```json\s*\n/, '')
        .replace(/\n```$/, '')
        .replace(/^```\s*\n/, '')
        .replace(/\n```$/, '')
        .trim()

      const action = parse(res.text) as Action

      switch (action.action) {
        case 'readMessages':
          if (forGroupId && forGroupId === action.groupId.toString()
            && state.unreadMessages[action.groupId]
            && state.unreadMessages[action.groupId].length > 0) {
            state.logger.log(`Interrupting message processing for group ${action.groupId} - new messages arrived`)
            return handleLoop(state)
          }
          if (Object.keys(state.unreadMessages).length === 0) {
            break
          }
          if (action.groupId == null) {
            break
          }
          if (state.unreadMessages[action.groupId].length === 0) {
            delete state.unreadMessages[action.groupId]
            break
          }

          // eslint-disable-next-line no-case-declarations
          const unreadMessages = state.unreadMessages[action.groupId] as Message[]
          // eslint-disable-next-line no-case-declarations
          const unreadMessagesEmbeddingPromises = unreadMessages
            .filter(msg => !!msg.text || !!msg.caption)
            .map(async (msg: Message) => {
              const embeddingResult = await embed({
                baseURL: env.EMBEDDING_API_BASE_URL!,
                apiKey: env.EMBEDDING_API_KEY!,
                model: env.EMBEDDING_MODEL!,
                input: msg.text || msg.caption || '',
                abortSignal: state.currentAbortController.signal,
              })

              return {
                embedding: embeddingResult.embedding,
                message: msg,
              }
            })

          // eslint-disable-next-line no-case-declarations
          const unreadHistoryMessagesEmbedding = await Promise.all(unreadMessagesEmbeddingPromises)

          logger.withField('number_of_tasks', unreadMessagesEmbeddingPromises.length).log('Successfully embedded unread history messages')

          // eslint-disable-next-line no-case-declarations
          const lastNMessages = await findLastNMessages(action.groupId, 30)
          // eslint-disable-next-line no-case-declarations
          const lastNMessagesOneliner = lastNMessages.map(msg => chatMessageToOneLine(msg)).join('\n')

          logger.withField('number_of_last_n_messages', lastNMessages.length).log('Successfully found last N messages')

          // eslint-disable-next-line no-case-declarations
          const unreadHistoryMessages = await Promise.all(state.unreadMessages[action.groupId].map(msg => telegramMessageToOneLine(state.bot, msg)))
          // eslint-disable-next-line no-case-declarations
          const unreadHistoryMessageOneliner = unreadHistoryMessages.join('\n')

          state.unreadMessages[action.groupId] = []

          // eslint-disable-next-line no-case-declarations
          const db = useDrizzle()
          // eslint-disable-next-line no-case-declarations
          const contextWindowSize = 5 // Number of messages to include before and after

          logger.withField('context_window_size', contextWindowSize).log('Querying relevant chat messages...')

          // eslint-disable-next-line no-case-declarations
          const relevantChatMessages = await Promise.all(unreadHistoryMessagesEmbedding.map(async (embedding) => {
            let similarity: SQL<number>

            switch (env.EMBEDDING_DIMENSION) {
              case '1536':
                similarity = sql<number>`(1 - (${cosineDistance(chatMessagesTable.content_vector_1536, embedding.embedding)}))`
                break
              case '1024':
                similarity = sql<number>`(1 - (${cosineDistance(chatMessagesTable.content_vector_1024, embedding.embedding)}))`
                break
              case '768':
                similarity = sql<number>`(1 - (${cosineDistance(chatMessagesTable.content_vector_768, embedding.embedding)}))`
                break
              default:
                throw new Error(`Unsupported embedding dimension: ${env.EMBEDDING_DIMENSION}`)
            }

            const timeRelevance = sql<number>`(1 - (CEIL(EXTRACT(EPOCH FROM NOW()) * 1000)::bigint - ${chatMessagesTable.created_at}) / 86400 / 30)`
            const combinedScore = sql<number>`((1.2 * ${similarity}) + (0.2 * ${timeRelevance}))`

            // Get top messages with similarity above threshold
            const relevantMessages = await db
              .select({
                id: chatMessagesTable.id,
                platform: chatMessagesTable.platform,
                from_id: chatMessagesTable.from_id,
                from_name: chatMessagesTable.from_name,
                in_chat_id: chatMessagesTable.in_chat_id,
                content: chatMessagesTable.content,
                is_reply: chatMessagesTable.is_reply,
                reply_to_name: chatMessagesTable.reply_to_name,
                created_at: chatMessagesTable.created_at,
                updated_at: chatMessagesTable.updated_at,
                similarity: sql`${similarity} AS "similarity"`,
                time_relevance: sql`${timeRelevance} AS "time_relevance"`,
                combined_score: sql`${combinedScore} AS "combined_score"`,
              })
              .from(chatMessagesTable)
              .where(sql`${similarity} > '0.5' AND ${chatMessagesTable.in_chat_id} = ${embedding.message.chat.id} AND ${chatMessagesTable.platform} = 'telegram'`)
              .orderBy(desc(sql`combined_score`))
              .limit(3)

            logger.withField('number_of_relevant_messages', relevantMessages.length).log('Successfully found relevant chat messages')

            // Now fetch the context for each message
            return await Promise.all(
              relevantMessages.map(async (message) => {
                // Get N messages before the target message
                const messagesBefore = await db
                  .select({
                    id: chatMessagesTable.id,
                    platform: chatMessagesTable.platform,
                    from_id: chatMessagesTable.from_id,
                    from_name: chatMessagesTable.from_name,
                    in_chat_id: chatMessagesTable.in_chat_id,
                    content: chatMessagesTable.content,
                    is_reply: chatMessagesTable.is_reply,
                    reply_to_name: chatMessagesTable.reply_to_name,
                    created_at: chatMessagesTable.created_at,
                    updated_at: chatMessagesTable.updated_at,
                  })
                  .from(chatMessagesTable)
                  .where(sql`${chatMessagesTable.in_chat_id} = ${message.in_chat_id} AND ${chatMessagesTable.created_at} < ${message.created_at} AND ${chatMessagesTable.platform} = 'telegram'`)
                  .orderBy(desc(chatMessagesTable.created_at))
                  .limit(contextWindowSize)

                // Get N messages after the target message
                const messagesAfter = await db
                  .select({
                    id: chatMessagesTable.id,
                    platform: chatMessagesTable.platform,
                    from_id: chatMessagesTable.from_id,
                    from_name: chatMessagesTable.from_name,
                    in_chat_id: chatMessagesTable.in_chat_id,
                    content: chatMessagesTable.content,
                    is_reply: chatMessagesTable.is_reply,
                    reply_to_name: chatMessagesTable.reply_to_name,
                    created_at: chatMessagesTable.created_at,
                    updated_at: chatMessagesTable.updated_at,
                  })
                  .from(chatMessagesTable)
                  .where(sql`${chatMessagesTable.in_chat_id} = ${message.in_chat_id} AND ${chatMessagesTable.created_at} > ${message.created_at} AND ${chatMessagesTable.platform} = 'telegram'`)
                  .orderBy(chatMessagesTable.created_at)
                  .limit(contextWindowSize)

                // Combine all messages in chronological order
                const contextMessages = [
                  ...messagesBefore.reverse(), // Reverse to get chronological order
                  message,
                  ...messagesAfter,
                ]

                logger.withField('number_of_context_messages', contextMessages.length).log('Combined context messages')

                const contextMessagesOneliner = (await Promise.all(contextMessages.map(m => chatMessageToOneLine(m))))
                return `One of the relevant message along with the context:\n${contextMessagesOneliner}`
              }),
            )
          }))

          // eslint-disable-next-line no-case-declarations
          const relevantChatMessagesOneliner = (await Promise.all(
            relevantChatMessages.map(async (msgs) => {
              return msgs.join('\n')
            }),
          )).join('\n')

          logger.withField('number_of_relevant_chat_messages', relevantChatMessages.length).log('Successfully composed relevant chat messages')

          // eslint-disable-next-line no-case-declarations
          const messages = message.messages(
            systemPrompt(),
            message.user(''
              + 'Last 30 messages:\n'
              + `${lastNMessagesOneliner}`,
            ),
            message.user(''
              + 'All unread messages:'
              + `${unreadHistoryMessageOneliner}`,
            ),
            message.user(''
              + 'I helped you searched these relevant chat messages may help you recall the memories:'
              + `${relevantChatMessagesOneliner}`,
            ),
            message.user(''
              + `Currently, it\'s ${new Date()} on the server that hosts you.`
              + `${lastNMessagesOneliner}, `
              + 'the others in the group may live in a different timezone, so please be aware of the time difference.',
            ),
            message.user('Choose your action. Would you like to say something? Or ignore?'),
          )

          // eslint-disable-next-line no-case-declarations
          const response = await generateText({
            apiKey: env.LLM_API_KEY!,
            baseURL: env.LLM_API_BASE_URL!,
            model: env.LLM_MODEL!,
            messages,
            abortSignal: state.currentAbortController.signal,
          })

          response.text = response.text
            .replace(/^```json\s*\n/, '')
            .replace(/\n```$/, '')
            .replace(/^```\s*\n/, '')
            .replace(/\n```$/, '')
            .trim()

          logger.withField('response', JSON.stringify(response.text)).log('Successfully generated response')

          await sendMayStructuredMessage(state, response.text, action.groupId.toString())
          break
        case 'listChats':
          msgs.push(message.user(`List of chats:${(await listJoinedChats()).map(chat => `ID:${chat.chat_id}, Name:${chat.chat_name}`).join('\n')}`))
          await handleLoop(state, msgs)
          break
        case 'sendMessage':
          await sendMayStructuredMessage(state, action.content, action.groupId)
          break
      }
    }
    catch (err) {
      state.logger.withError(err).withField('cause', String(err.cause)).log('Error occurred')
    }
  }
  catch (err) {
    // Check if this is an abort error, which we can safely ignore
    if (err.name === 'AbortError') {
      state.logger.log('Operation was aborted due to interruption')
      return
    }
    state.logger.withError(err).log('Error occurred')
  }
  finally {
    // Clean up the abort controller
    state.currentAbortController = null
  }
}

function loop(state: BotSelf) {
  setTimeout(() => {
    handleLoop(state)
      .then(() => loop(state))
      .catch((err) => {
        if (err.name === 'AbortError') {
          // This is expected when we interrupt processing
          state.logger.log('Main loop was aborted - restarting loop')
        }
        else {
          state.logger.withError(err).log('Error in main loop')
        }
        // Always continue the loop
        loop(state)
      })
  }, 5000)
}

function newBotSelf(bot: Bot, logger: Logg): BotSelf {
  return {
    bot,
    currentTask: null,
    currentAbortController: null,
    messageQueue: [],
    unreadMessages: {},
    processedIds: new Set(),
    logger,
    processing: false,
  }
}

async function processMessageQueue(state: BotSelf) {
  if (state.processing)
    return
  state.processing = true

  try {
    while (state.messageQueue.length > 0) {
      const nextMsg = state.messageQueue[0]

      // Don't process next messages until current one is ready
      if (nextMsg.status === 'pending') {
        if (nextMsg.message.sticker) {
          nextMsg.status = 'interpreting'
          await interpretSticker(state, nextMsg.message)
          nextMsg.status = 'ready'
        }
        else if (nextMsg.message.photo) {
          nextMsg.status = 'interpreting'
          await interpretPhotos(state, nextMsg.message, nextMsg.message.photo)
          nextMsg.status = 'ready'
        }
        else {
          nextMsg.status = 'ready'
        }
      }

      if (nextMsg.status === 'ready') {
        await recordJoinedChat(nextMsg.message.chat.id.toString(), nextMsg.message.chat.title)
        if (state.unreadMessages[nextMsg.message.chat.id] == null) {
          state.unreadMessages[nextMsg.message.chat.id] = []
        }

        state.unreadMessages[nextMsg.message.chat.id].push(nextMsg.message)
        if (state.unreadMessages[nextMsg.message.chat.id].length > 20) {
          state.unreadMessages[nextMsg.message.chat.id] = state.unreadMessages[nextMsg.message.chat.id].slice(-20)
        }

        // Check if we're currently processing this chat group
        if (state.currentAbortController
          && state.currentTask
          && state.unreadMessages[nextMsg.message.chat.id].length > 0) {
          // Interrupt the current processing
          state.currentAbortController.abort()
          state.logger.log(`Interrupting due to new message in chat ${nextMsg.message.chat.id}`)
        }

        state.messageQueue.shift()
      }
    }
  }
  catch (err) {
    state.logger.withError(err).log('Error occurred')
  }
  finally {
    state.processing = false
  }
}

export async function startTelegramBot() {
  const log = useLogg('Bot').useGlobalConfig()

  const bot = new Bot<ExtendedContext>(env.TELEGRAM_BOT_TOKEN!)
  const state = newBotSelf(bot, log)

  bot.on('message:sticker', async (ctx) => {
    if (ctx.message.sticker.is_animated || ctx.message.sticker.is_video)
      return

    const messageId = `${ctx.message.chat.id}-${ctx.message.message_id}`
    if (!state.processedIds.has(messageId)) {
      state.processedIds.add(messageId)
      state.messageQueue.push({
        message: ctx.message,
        status: 'pending',
      })
    }

    processMessageQueue(state)
  })

  bot.on('message:photo', async (ctx) => {
    const messageId = `${ctx.message.chat.id}-${ctx.message.message_id}`
    if (!state.processedIds.has(messageId)) {
      state.processedIds.add(messageId)
      state.messageQueue.push({
        message: ctx.message,
        status: 'pending',
      })
    }

    processMessageQueue(state)
  })

  bot.on('message:text', async (ctx) => {
    const messageId = `${ctx.message.chat.id}-${ctx.message.message_id}`
    if (!state.processedIds.has(messageId)) {
      state.processedIds.add(messageId)
      state.messageQueue.push({
        message: ctx.message,
        status: 'ready',
      })
    }

    processMessageQueue(state)
  })

  bot.command('load_sticker_pack', async (ctx) => {
    if (!(await isChatIdBotAdmin(ctx.chat.id))) {
      return
    }
    if (!ctx.message || !ctx.message.sticker) {
      return
    }

    await interpretSticker(state, ctx.message)
  })

  bot.errorHandler = async (err) => {
    log.withError(err).log('Error occurred')
  }

  await bot.init()
  log.withField('bot_username', bot.botInfo.username).log('Authorized bot')

  bot.start({
    drop_pending_updates: true,
  })

  try {
    loop(state)
  }
  catch (err) {
    console.error(err)
  }
}
