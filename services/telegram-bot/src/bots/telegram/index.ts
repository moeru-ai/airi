import type { Logg } from '@guiiai/logg'
import type { Message as LLMMessage } from '@xsai/shared-chat'
import type { Action, BotSelf, ExtendedContext } from '../../types'

import { env } from 'node:process'
import { useLogg } from '@guiiai/logg'
import { generateText } from '@xsai/generate-text'
import { message } from '@xsai/utils-chat'
import { parse } from 'best-effort-json-parser'
import { Bot } from 'grammy'

import { interpretPhotos } from '../../llm/photo'
import { interpretSticker } from '../../llm/sticker'
import { listJoinedChats, recordJoinedChat } from '../../models/chats'
import { systemPrompt } from '../../prompts/system-v1'
import { readMessage } from './loop/read-message'
import { sendMayStructuredMessage } from './utils/message'

async function isChatIdBotAdmin(chatId: number) {
  const admins = env.ADMIN_USER_IDS!.split(',')
  return admins.includes(chatId.toString())
}

async function handleLoop(state: BotSelf, msgs?: LLMMessage[], forGroupId?: string) {
  // Create a new abort controller for this loop execution
  if (state.currentAbortController) {
    state.currentAbortController.abort()
  }
  state.currentAbortController = new AbortController()

  try {
    if (msgs == null) {
      msgs = message.messages(
        message.system(''
          + `${systemPrompt()}`
          + '\n'
          + 'I am one of your system component, called Ticking system, which is responsible to keep track of the time, and '
          + 'help you schedule, retain focus, and keep eyes on different tasks, and ideas you have.'
          + '\n'
          + 'Please remember, I am not a human, I am a system that part of you. You should return system/machine readable '
          + 'messages to me, so I can understand and process them correctly.'
          + '\n'
          + 'Now, please, based on the following context, choose a right action from the listing of the tools you want to '
          + 'take next:',
        ),
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
          // eslint-disable-next-line no-case-declarations
          const result = await readMessage(state, msgs, action, forGroupId)
          if (result.loop) {
            return handleLoop(state)
          }
          if (result.break) {
            break
          }

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
