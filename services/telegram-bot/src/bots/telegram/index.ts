import type { Message as LLMMessage } from '@xsai/shared-chat'
import type { Action, BotSelf, ExtendedContext } from '../../types'

import { env } from 'node:process'
import { type Logg, useLogg } from '@guiiai/logg'
import { generateText } from '@xsai/generate-text'
import { message } from '@xsai/shared-chat'
import { randomInt } from 'es-toolkit'
import { Bot } from 'grammy'

import { openAI } from '../../llm'
import { interpretPhotos } from '../../llm/photo'
import { interpretSticker } from '../../llm/sticker'
import { recordMessage } from '../../models'
import { listJoinedChats, recordJoinedChat } from '../../models/chats'
import { telegramMessageToOneLine } from '../../models/common'
import { consciousnessSystemPrompt, systemPrompt } from '../../prompts/system-v1'
import { cancellable, sleep } from '../../utils/promise'

async function sendMayStructuredMessage(
  state: BotSelf,
  responseText: string,
  groupId: string,
) {
  const chat = (await listJoinedChats()).find((chat) => {
    return chat.chatId === groupId
  })
  if (!chat) {
    return
  }

  const chatId = chat.chatId

  // Cancel any existing task before starting a new one
  if (state.currentTask) {
    state.currentTask.cancel()
    state.currentTask = null
  }

  // If we get here, the task wasn't cancelled, so we can send the response
  // eslint-disable-next-line regexp/no-unused-capturing-group, regexp/no-super-linear-backtracking
  const arrayRegexp = /\[(((\s*),(\s*))?(".*"))*\]/
  if (arrayRegexp.test(responseText)) {
    const result = arrayRegexp.exec(responseText)
    const array = JSON.parse(result![0]) as string[]

    for (const item of array) {
      // Create cancellable typing and reply tasks
      await state.bot.api.sendChatAction(chatId, 'typing')
      await sleep(item.length * 200)

      const replyTask = cancellable(state.bot.api.sendMessage(chatId, item))
      state.currentTask = replyTask
      const msg = await replyTask.promise
      await recordMessage(state.bot.botInfo, msg)
      await sleep(randomInt(50, 1000))
    }
  }
  else if (responseText) {
    await state.bot.api.sendChatAction(chatId, 'typing')
    const replyTask = cancellable(state.bot.api.sendMessage(chatId, responseText))
    state.currentTask = replyTask
    const msg = await replyTask.promise
    await recordMessage(state.bot.botInfo, msg)
  }

  state.currentTask = null
}

async function handleLoop(state: BotSelf, msgs?: LLMMessage[]) {
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
    ...openAI.chat('openai/gpt-4o-mini'),
    messages: msgs,
  })

  state.logger.withFields({
    response: res.text,
    unreadMessages: Object.fromEntries(Object.entries(state.unreadMessages).map(([key, value]) => [key, value.length])),
    now: new Date().toLocaleString(),
  }).log('Generated action')

  try {
    const action = JSON.parse(res.text) as Action

    switch (action.action) {
      case 'readMessages':
        if (Object.keys(state.unreadMessages).length === 0) {
          break
        }
        if (action.groupId == null) {
          break
        }
        if (state.unreadMessages[action.groupId] == null) {
          break
        }

        // eslint-disable-next-line no-case-declarations
        const unreadHistoryMessageOneliner = (await Promise.all(state.unreadMessages[action.groupId].map(msg => telegramMessageToOneLine(msg)))).join('\n')
        state.unreadMessages[action.groupId] = []

        // eslint-disable-next-line no-case-declarations
        const response = await generateText({
          ...openAI.chat('openai/gpt-4o-mini'),
          messages: message.messages(
            systemPrompt(),
            message.user(`All unread messages:\n${unreadHistoryMessageOneliner}`),
            message.user('Would you like to say something? Or ignore?'),
          ),
        })

        await sendMayStructuredMessage(state, response.text, action.groupId.toString())
        break
      case 'listChats':
        msgs.push(message.user(`List of chats:${(await listJoinedChats()).map(chat => `ID:${chat.chatId}, Name:${chat.chatName}`).join('\n')}`))
        await handleLoop(state, msgs)
        break
      case 'sendMessage':
        await sendMayStructuredMessage(state, action.content, action.groupId)
        break
    }
  }
  catch (err) {
    state.logger.withError(err).log('Error occurred')
  }
}

function loop(state: BotSelf) {
  setTimeout(() => {
    handleLoop(state).then(() => loop(state))
  }, 20000)
}

function newBotSelf(bot: Bot, logger: Logg): BotSelf {
  return {
    bot,
    currentTask: null,
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
          state.unreadMessages[nextMsg.message.chat.id] = state.unreadMessages[nextMsg.message.chat.id].slice(20)
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

  bot.errorHandler = async (err) => {
    log.withError(err).log('Error occurred')
  }

  await bot.init()
  log.withField('bot_username', bot.botInfo.username).log('Authorized bot')

  bot.start({
    drop_pending_updates: true,
  })

  loop(state)
}
