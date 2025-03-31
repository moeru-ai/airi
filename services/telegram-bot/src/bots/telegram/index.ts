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
import { shouldInterruptProcessing } from './utils/interruption'
import { sendMayStructuredMessage } from './utils/message'

async function isChatIdBotAdmin(chatId: number) {
  const admins = env.ADMIN_USER_IDS!.split(',')
  return admins.includes(chatId.toString())
}

async function handleLoopStep(state: BotSelf, msgs?: LLMMessage[], chatId?: string): Promise<() => Promise<any> | undefined> {
  // Set the start time when beginning new processing
  state.currentProcessingStartTime = Date.now()

  // Create a new abort controller for this loop execution
  if (state.currentAbortController) {
    state.currentAbortController.abort()
  }
  state.currentAbortController = new AbortController()
  const currentController = state.currentAbortController

  // Track message processing state
  if (chatId && !state.lastInteractedNChatIds.includes(chatId)) {
    state.lastInteractedNChatIds.push(chatId)
  }
  if (state.lastInteractedNChatIds.length > 5) {
    state.lastInteractedNChatIds = state.lastInteractedNChatIds.slice(-5)
  }

  if (msgs == null) {
    msgs = []
  }

  try {
    const action = await imagineAnAction(state.bot.botInfo.id.toString(), state.unreadMessages, currentController, msgs, state.lastInteractedNChatIds)

    // If action generation failed, don't proceed with further processing
    if (!action || !action.action) {
      state.logger.log('No valid action returned. Skipping further processing.')
      return
    }

    switch (action.action) {
      case 'readMessages':
        if (Object.keys(state.unreadMessages).length === 0) {
          state.logger.log('No unread messages - deleting all unread messages')
          state.unreadMessages = {}
          break
        }
        if (action.chatId == null) {
          state.logger.log('No group ID - deleting all unread messages')
          state.unreadMessages = {}
          break
        }

        // eslint-disable-next-line no-case-declarations
        let unreadMessagesForThisChat: Message[] | undefined = state.unreadMessages[action.chatId]

        // Modified interruption logic
        if (chatId && chatId === action.chatId
          && unreadMessagesForThisChat
          && unreadMessagesForThisChat.length > 0) {
          const processingTime = state.currentProcessingStartTime
            ? Date.now() - state.currentProcessingStartTime
            : 0

          const messageCount = unreadMessagesForThisChat.length

          // Factors to consider for interruption:
          //
          // 1. How long we've been processing (longer = more likely to finish)
          // 2. Number of new messages (more = higher chance to interrupt)
          // 3. Message content importance (could be determined by LLM)

          const shouldInterrupt = await shouldInterruptProcessing({
            processingTime,
            messageCount,
            currentMessages: msgs,
            newMessages: unreadMessagesForThisChat,
            chatId: action.chatId,
          })

          if (shouldInterrupt) {
            state.logger.log(`Interrupting message processing for chat ${action.chatId} - new messages deemed more important`)
            return () => handleLoopStep(state)
          }
          else {
            state.logger.log(`Continuing current processing despite new messages in chat ${action.chatId}`)
          }
        }
        if (!Array.isArray(unreadMessagesForThisChat)) {
          state.logger.log(`Unread messages for group ${action.chatId} is not an array - converting to array`)
          unreadMessagesForThisChat = []
        }
        if (unreadMessagesForThisChat.length === 0) {
          state.logger.log(`No unread messages for group ${action.chatId} - deleting`)
          delete state.unreadMessages[action.chatId]
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

        await readMessage(state, state.bot.botInfo.id.toString(), chatId, action, unreadMessagesForThisChat, currentController)
        return
      case 'listChats':
        msgs.push(message.user(`List of chats:${(await listJoinedChats()).map(chat => `ID:${chat.chat_id}, Name:${chat.chat_name}`).join('\n')}`))
        return () => handleLoopStep(state, msgs, chatId)
      case 'sendMessage':
        await sendMayStructuredMessage(state, action.content, action.groupId)
        return
      default:
        msgs.push(message.user(`The action you sent ${action.action} haven't implemented yet by developer.`))
        return () => handleLoopStep(state, msgs, chatId)
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
    // Clean up timing when done
    if (state.currentAbortController === currentController) {
      state.currentAbortController = null
      state.currentProcessingStartTime = null
    }
  }
}

async function handleLoop(state: BotSelf, msgs?: LLMMessage[], chatId?: string) {
  let result = await handleLoopStep(state, msgs, chatId)

  while (typeof result === 'function') {
    result = await result()
  }

  return result
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
    lastInteractedNChatIds: [],
    currentProcessingStartTime: null,
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
        switch (nextMsg.message.chat.type) {
          case 'private':
            await recordJoinedChat(nextMsg.message.chat.id.toString(), `${nextMsg.message.from.first_name} ${nextMsg.message.from.last_name}`)
            break
          case 'channel':
          case 'group':
          case 'supergroup':
            await recordJoinedChat(nextMsg.message.chat.id.toString(), nextMsg.message.chat.title)
            break
        }

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

        if (unreadMessagesForThisChat.length > 100) {
          unreadMessagesForThisChat = unreadMessagesForThisChat.slice(-100)
        }

        state.unreadMessages[nextMsg.message.chat.id] = unreadMessagesForThisChat
        state.logger.withField('chatId', nextMsg.message.chat.id).log('message queue processed, triggering immediate reaction')
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

  bot.start({ drop_pending_updates: true })

  try {
    loop(state)
  }
  catch (err) {
    console.error(err)
  }
}
