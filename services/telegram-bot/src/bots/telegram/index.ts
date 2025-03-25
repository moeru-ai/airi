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
import { recordMessage } from '../../models'
import { listJoinedChats, recordJoinedChat } from '../../models/chats'
import { readMessage } from './loop/read-message'
import { sendMayStructuredMessage } from './utils/message'

async function isChatIdBotAdmin(chatId: number) {
  const admins = env.ADMIN_USER_IDS!.split(',')
  return admins.includes(chatId.toString())
}

async function handleLoop(state: BotSelf, msgs?: LLMMessage[], forGroupId?: string) {
  state.logger.log('handleLoop')

  // Create a new abort controller for this loop execution
  if (state.currentAbortController) {
    state.currentAbortController.abort()
  }
  state.currentAbortController = new AbortController()
  const currentController = state.currentAbortController // Store reference to current controller

  if (msgs == null) {
    msgs = []
  }

  try {
    try {
      const action = await imagineAnAction(state.unreadMessages, currentController, msgs)

      switch (action.action) {
        case 'readMessages':
          // eslint-disable-next-line no-case-declarations
          let unreadMessagesForThisChat: Message[] | undefined = state.unreadMessages[action.groupId]

          if (forGroupId && forGroupId === action.groupId.toString()
            && unreadMessagesForThisChat
            && unreadMessagesForThisChat.length > 0) {
            state.logger.log(`Interrupting message processing for group ${action.groupId} - new messages arrived`)
            return handleLoop(state)
          }
          if (Object.keys(state.unreadMessages).length === 0) {
            state.logger.log('No unread messages - deleting all unread messages')
            state.unreadMessages = {}
            break
          }
          if (action.groupId == null) {
            state.logger.log('No group ID - deleting all unread messages')
            state.unreadMessages = {}
            break
          }
          if (!Array.isArray(unreadMessagesForThisChat)) {
            state.logger.log(`Unread messages for group ${action.groupId} is not an array - converting to array`)
            unreadMessagesForThisChat = []
          }
          if (unreadMessagesForThisChat.length === 0) {
            state.logger.log(`No unread messages for group ${action.groupId} - deleting`)
            delete state.unreadMessages[action.groupId]
            break
          }

          // // Add attention check before processing action
          // // eslint-disable-next-line no-case-declarations
          // const shouldRespond = await state.attentionHandler.shouldRespond(forGroupId, unreadMessagesForThisChat)

          // if (!shouldRespond.shouldAct) {
          //   state.logger.withField('reason', shouldRespond.reason).withField('responseRate', shouldRespond.responseRate).log('Skipping message due to attention check')
          //   state.unreadMessages[action.groupId] = unreadMessagesForThisChat.shift()
          //   return { break: true }
          // }

          await readMessage(state, action, unreadMessagesForThisChat, currentController)
          break
        case 'listChats':
          msgs.push(message.user(`List of chats:${(await listJoinedChats()).map(chat => `ID:${chat.chat_id}, Name:${chat.chat_name}`).join('\n')}`))
          await handleLoop(state, msgs)
          break
        case 'sendMessage':
          await sendMayStructuredMessage(state, action.content, action.groupId)
          break
        default:
          msgs.push(message.user(`The action you sent ${action.action} haven't implemented yet by developer.`))
          await handleLoop(state, msgs)
          break
      }
    }
    catch (err) {
      state.logger.withError(err).withField('cause', String(err.cause)).log('Error occurred')
    }
  }
  catch (err) {
    if (err.name === 'AbortError') {
      state.logger.log('Operation was aborted due to interruption')
      return
    }

    state.logger.withError(err).log('Error occurred')
  }
  finally {
    // Only clean up if this is still the current controller
    if (state.currentAbortController === currentController) {
      state.currentAbortController = null
    }
  }
}

function loop(state: BotSelf) {
  setTimeout(() => {
    handleLoop(state)
      .then(() => {})
      .catch((err) => {
        if (err.name === 'AbortError')
          state.logger.log('main loop was aborted - restarting loop')
        else
          state.logger.withError(err).log('error in main loop')
      })
      .finally(() => loop(state))
  }, 5 * 60 * 1000)
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

  // botSelf.attentionHandler = createAttentionHandler(botSelf, {
  //   initialResponseRate: 0.3,
  //   responseRateMin: 0.2,
  //   responseRateMax: 1,
  //   cooldownMs: 5000, // 30 seconds
  //   triggerWords: ['ReLU', 'relu', 'RELU', 'Relu', '热卤'],
  //   ignoreWords: ['ignore me'],
  //   decayRatePerMinute: 0.05,
  //   decayCheckIntervalMs: 20000,
  // })

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
        await recordMessage(state.bot.botInfo, nextMsg.message)

        let unreadMessagesForThisChat = state.unreadMessages[nextMsg.message.chat.id]

        if (unreadMessagesForThisChat == null) {
          state.logger.withField('chatId', nextMsg.message.chat.id).log('unread messages for this chat is null - creating empty array')
          unreadMessagesForThisChat = []
        }
        if (!Array.isArray(unreadMessagesForThisChat)) {
          state.logger.withField('chatId', nextMsg.message.chat.id).log('unread messages for this chat is not an array - converting to array')
          unreadMessagesForThisChat = []
        }

        unreadMessagesForThisChat.push(nextMsg.message)

        if (unreadMessagesForThisChat.length > 20) {
          unreadMessagesForThisChat = unreadMessagesForThisChat.slice(-20)
        }

        state.unreadMessages[nextMsg.message.chat.id] = unreadMessagesForThisChat

        // Trigger immediate processing when messages are ready
        handleLoop(state, [], nextMsg.message.chat.id.toString())
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
  log.withField('bot_username', bot.botInfo.username).log('bot initialized')

  bot.start()

  try {
    loop(state)
  }
  catch (err) {
    console.error(err)
  }
}
