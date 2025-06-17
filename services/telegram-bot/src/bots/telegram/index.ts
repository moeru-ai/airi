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
import { findStickerByFileId, recordMessage } from '../../models'
import { listJoinedChats, recordJoinedChat } from '../../models/chats'
import { listStickerPacks, recordStickerPack } from '../../models/sticker-packs'
import { personality, systemTicking } from '../../prompts/system-v1'
import { div } from '../../prompts/utils'
import { readMessage } from './loop/read-message'
import { shouldInterruptProcessing } from './utils/interruption'
import { sendMayStructuredMessage } from './utils/message'

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

  if (msgs == null || msgs.length === 0) {
    msgs = [
      message.system(
        div(
          personality().content,
          systemTicking(),
        ),
      ),
    ]
  }

  try {
    const action = await imagineAnAction(state.bot.botInfo.id.toString(), state.unreadMessages, currentController, msgs, state.lastInteractedNChatIds)

    // If action generation failed, don't proceed with further processing
    if (!action || !action.action) {
      state.logger.withField('action', action).log('No valid action returned. Skipping further processing.')
      return
    }

    switch (action.action) {
      case 'list_stickers':
      {
        await state.bot.api.sendChatAction(chatId, 'choose_sticker')

        const stickerPacks = await listStickerPacks()
        const stickerSets = await Promise.all(stickerPacks.map(s => state.bot.api.getStickerSet(s.platform_id)))
        const stickerDescriptions = await Promise.all(stickerSets.map(s => Promise.all(s.stickers.map(sticker => findStickerByFileId(sticker.file_id)))))
        const stickerDescriptionsOneliner = stickerDescriptions.map(d => d.map(s => `Sticker File ID: ${s.file_id}, Description: ${s.description}`).join('\n')).join('\n')

        msgs.push(message.user(`List of stickers:\n${stickerDescriptionsOneliner}`))
        return () => handleLoopStep(state, msgs, chatId)
      }
      case 'send_sticker':
      {
        try {
          const file = await state.bot.api.getFile(action.fileId)
          if (!file) {
            msgs.push(message.user(`Sticker file ID ${action.fileId} not found, did you list the needed stickers before sending?.`))
            return () => handleLoopStep(state, msgs, chatId)
          }
        }
        catch (err) {
          msgs.push(message.user(`Sticker file ID ${action.fileId} not found or failed due to ${String(err)}, did you list the needed stickers before sending?.`))
          return () => handleLoopStep(state, msgs, chatId)
        }

        const sticker = await findStickerByFileId(action.fileId)
        msgs.push(message.user(`Sending sticker ${action.fileId} with (${sticker.emoji} in set ${sticker.name}) to ${action.chatId}`))
        await state.bot.api.sendSticker(action.chatId, action.fileId)

        break
      }
      case 'read_messages':
      {
        if (Object.keys(state.unreadMessages).length === 0) {
          state.logger.withField('action', action).log('No unread messages - deleting all unread messages')
          state.unreadMessages = {}
          break
        }
        if (action.chatId == null) {
          state.logger.withField('action', action).warn('No group ID - deleting all unread messages')
          break
        }

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
            state.logger.withField('action', action).log(`Interrupting message processing for chat - new messages deemed more important`)
            msgs.push(message.user(`Interrupting message processing for chat - new messages deemed more important`))
            return () => handleLoopStep(state, msgs, chatId)
          }
          else {
            state.logger.withField('action', action).log(`Continuing current processing despite new messages in chat`)
          }
        }
        if (!Array.isArray(unreadMessagesForThisChat)) {
          state.logger.withField('action', action).log(`Unread messages for group is not an array - converting to array`)
          unreadMessagesForThisChat = []
        }
        if (unreadMessagesForThisChat.length === 0) {
          state.logger.withField('action', action).log(`No unread messages for group - deleting`)
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

        const result = await readMessage(state, state.bot.botInfo.id.toString(), chatId, action, unreadMessagesForThisChat, currentController)
        if (result?.result) {
          msgs.push(message.user(`Reading message of chat ${action.chatId}:\n${result.result}`))
          return () => handleLoopStep(state, msgs, chatId)
        }
        else {
          return
        }
      }
      case 'list_chats':
        msgs.push(message.user(`List of chats:${(await listJoinedChats()).map(chat => `ID:${chat.chat_id}, Name:${chat.chat_name}`).join('\n')}`))
        return () => handleLoopStep(state, msgs, chatId)
      case 'send_message':
        msgs.push(message.user(`Sending message to group ${action.chatId}: ${action.content}`))
        await sendMayStructuredMessage(state, action.content, action.chatId)
        return () => handleLoopStep(state, msgs, chatId)
      case 'break':
        break
      case 'sleep':
        break
      case 'continue':
        return () => handleLoopStep(state, msgs, chatId)
      default:
        msgs.push(message.user(`The action you sent ${action.action} haven't implemented yet by developer.`))
        break
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

async function isChatIdBotAdmin(fromId: number) {
  if (!env.ADMIN_USER_IDS) {
    return false
  }

  const admins = env.ADMIN_USER_IDS.split(',')
  if (admins.length === 0) {
    return false
  }

  return admins.includes(fromId.toString())
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
  }, 60 * 1000)
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
          await interpretSticker(state.bot, nextMsg.message, nextMsg.message.sticker)
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

  bot.command('add_sticker_pack', async (ctx) => {
    if (!(await isChatIdBotAdmin(ctx.message.from.id))) {
      log.withField('from_id', ctx.message.from.id).log('not an admin - skipping')
      return
    }
    if (ctx.message.reply_to_message == null) {
      await ctx.reply('Please reply to a sticker pack to add it.')
      return
    }

    const logger = useLogg('addStickerPack').useGlobalConfig()

    const repliedSticker = ctx.message.reply_to_message.sticker
    const stickerSet = await bot.api.getStickerSet(repliedSticker.set_name)

    logger.withField('sticker_set', repliedSticker.set_name).log('now will register the sticker set as known sticker set')

    for (const sticker of stickerSet.stickers) {
      logger.withField('sticker', sticker).log('interpreting sticker')
      await interpretSticker(state.bot, ctx.message.reply_to_message, sticker)
      logger.withField('sticker', sticker).log('interpreted sticker')
    }

    await recordStickerPack(repliedSticker.set_name, stickerSet.name)
    await ctx.reply('Sticker pack added.')
  })

  bot.on('message:sticker', async (ctx) => {
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

  bot.errorHandler = async err => log.withError(err).log('Error occurred')
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
