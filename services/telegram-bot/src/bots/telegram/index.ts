import type { Logg } from '@guiiai/logg'
import type { Message as LLMMessage } from '@xsai/shared-chat'
import type { Message } from 'grammy/types'
import type { BotSelf, ExtendedContext } from '../../types'

import { env } from 'node:process'
import { useLogg } from '@guiiai/logg'
import { message } from '@xsai/utils-chat'
import { Bot } from 'grammy'

import { imagineAnAction } from '../../llm/actions'
import { interpretPhotos } from '../../llm/photo'
import { interpretSticker } from '../../llm/sticker'
import { listJoinedChats, recordJoinedChat } from '../../models/chats'
import { createAttentionHandler } from './attention-handler'
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
    try {
      const action = await imagineAnAction(state.unreadMessages, state.currentAbortController, msgs)

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

          // Add attention check before processing action
          // eslint-disable-next-line no-case-declarations
          const shouldRespond = await state.attentionHandler.shouldRespond(forGroupId, unreadMessages)

          if (!shouldRespond.shouldAct) {
            state.logger.withField('reason', shouldRespond.reason)
              .withField('responseRate', shouldRespond.responseRate)
              .log('Skipping message due to attention check')
            return { break: true }
          }

          await readMessage(state, action, unreadMessages)
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
  const botSelf: BotSelf = {
    bot,
    currentTask: null,
    currentAbortController: null,
    messageQueue: [],
    unreadMessages: {},
    processedIds: new Set(),
    logger,
    processing: false,
    attentionHandler: undefined,
  }

  botSelf.attentionHandler = createAttentionHandler(botSelf, {
    initialResponseRate: 0.3,
    responseRateMin: 0.1,
    responseRateMax: 0.8,
    cooldownMs: 30000, // 30 seconds
    triggerWords: ['hey bot', 'hello bot'],
    ignoreWords: ['ignore me'],
    decayRatePerMinute: 0.1,
    decayCheckIntervalMs: 20000,
  })

  return botSelf
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
