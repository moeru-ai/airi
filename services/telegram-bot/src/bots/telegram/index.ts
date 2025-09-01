import type { Logg } from '@guiiai/logg'
import type { Message as LLMMessage } from '@xsai/shared-chat'
import type { Message } from 'grammy/types'

import type { Action, BotSelf, ExtendedContext } from '../../types'

import { env } from 'node:process'

import { useLogg } from '@guiiai/logg'
import { sleep } from '@moeru/std'
import { message } from '@xsai/utils-chat'
import { Bot } from 'grammy'

import { imagineAnAction } from '../../llm/actions'
import { interpretPhotos } from '../../llm/photo'
import { interpretSticker } from '../../llm/sticker'
import { findStickerByFileId, findStickersByFileIds, recordMessage } from '../../models'
import { listJoinedChats, recordJoinedChat } from '../../models/chats'
import { listStickerPacks, recordStickerPack } from '../../models/sticker-packs'
import { readMessage } from './agent/actions/read-message'
import { sendMessage } from './agent/actions/send-message'
import { shouldInterruptProcessing } from './agent/interruption'

interface AgentState {
  messages: LLMMessage[]
  actions: { action: Action, result: unknown }[]
}

async function handleLoopStep(bot: BotSelf, agentState: AgentState, chatId?: string): Promise<() => Promise<any> | undefined> {
  // Set the start time when beginning new processing
  bot.currentProcessingStartTime = Date.now()

  // Create a new abort controller for this loop execution
  if (bot.currentAbortController) {
    bot.currentAbortController.abort()
  }
  bot.currentAbortController = new AbortController()
  const currentController = bot.currentAbortController

  // Track message processing state
  if (chatId && !bot.lastInteractedNChatIds.includes(chatId)) {
    bot.lastInteractedNChatIds.push(chatId)
  }
  if (bot.lastInteractedNChatIds.length > 5) {
    bot.lastInteractedNChatIds = bot.lastInteractedNChatIds.slice(-5)
  }

  if (agentState.messages == null) {
    agentState.messages = []
  }
  if (agentState.messages.length > 20) {
    const length = agentState.messages.length
    // pick the latest 5
    agentState.messages = agentState.messages.slice(-5)
    agentState.messages.push(message.user(`AIRI System: Approaching to system context limit, reducing... memory..., reduced from ${length} to ${agentState.messages.length}, history may lost.`))
  }

  if (agentState.actions == null) {
    agentState.actions = []
  }
  if (agentState.actions.length > 50) {
    const length = agentState.actions.length
    // pick the latest 20
    agentState.actions = agentState.actions.slice(-20)
    agentState.messages.push(message.user(`AIRI System: Approaching to system context limit, reducing... memory..., reduced from ${length} to ${agentState.actions.length}, history of actions may lost.`))
  }

  try {
    const readUnreadMessagesActions: { index: number, actionState: typeof agentState.actions[number] }[] = []

    for (const actionHistory of agentState.actions) {
      if (actionHistory.action.action === 'read_unread_messages') {
        readUnreadMessagesActions.push({ index: agentState.actions.indexOf(actionHistory), actionState: actionHistory })
      }
    }

    readUnreadMessagesActions.map((item, index) => {
      if (index === readUnreadMessagesActions.length - 1) {
        return item
      }

      item.actionState.result = 'AIRI System: Please refer to the last read_unread_messages action for context.'
      return item
    })

    for (const item of readUnreadMessagesActions) {
      agentState.actions[item.index] = item.actionState
    }

    const action = await imagineAnAction(bot.bot.botInfo.id.toString(), currentController, agentState.messages, agentState.actions, { unreadMessages: bot.unreadMessages })

    // If action generation failed, don't proceed with further processing
    if (!action || !action.action) {
      bot.logger.withField('action', action).log('No valid action returned.')
      agentState.messages.push(message.user('AIRI System: No valid action returned.'))
      return () => handleLoopStep(bot, agentState, chatId)
    }

    switch (action.action) {
      case 'list_stickers':
      {
        await bot.bot.api.sendChatAction(chatId, 'choose_sticker')

        const stickerPacks = await listStickerPacks()
        const stickerSets = await Promise.all(stickerPacks.map(s => bot.bot.api.getStickerSet(s.platform_id)))
        const stickersIds = stickerSets.flatMap(s => s.stickers.map(sticker => sticker.file_id))
        const stickerDescriptions = await findStickersByFileIds(stickersIds)
        const stickerDescriptionsOneliner = stickerDescriptions.map(d => `Sticker File ID: ${d.file_id}, Description: ${d.description}`)

        if (stickerDescriptionsOneliner.length === 0) {
          agentState.actions.push({ action, result: 'AIRI System: No stickers found in the current memory partition, preload of stickers is required, please ask for help.' })
        }
        else {
          agentState.actions.push({ action, result: `AIRI System: List of stickers:\n${stickerDescriptionsOneliner}` })
        }

        return () => handleLoopStep(bot, agentState, chatId)
      }
      case 'send_sticker':
      {
        try {
          const file = await bot.bot.api.getFile(action.fileId)
          if (!file) {
            agentState.actions.push({ action, result: `AIRI System: Error executing 'send_sticker': Sticker file ID ${action.fileId} not found, did you list the needed stickers before sending?.` })
            return () => handleLoopStep(bot, agentState, chatId)
          }
        }
        catch (err) {
          agentState.actions.push({ action, result: `AIRI System: Error executing 'send_sticker': Sticker file ID ${action.fileId} not found or failed due to ${String(err)}, did you list the needed stickers before sending?.` })
          return () => handleLoopStep(bot, agentState, chatId)
        }

        const sticker = await findStickerByFileId(action.fileId)
        agentState.actions.push({ action, result: `AIRI System: Sending sticker ${action.fileId} with (${sticker.emoji} in set ${sticker.name}) to ${action.chatId}` })
        await bot.bot.api.sendSticker(action.chatId, action.fileId)

        return () => handleLoopStep(bot, agentState, chatId)
      }
      case 'read_unread_messages':
      {
        if (Object.keys(bot.unreadMessages).length === 0) {
          bot.logger.withField('action', action).log('No unread messages - deleting all unread messages')
          bot.unreadMessages = {}
          break
        }
        if (action.chatId == null) {
          bot.logger.withField('action', action).warn('No group ID - deleting all unread messages')
          break
        }

        let unreadMessagesForThisChat: Message[] | undefined = bot.unreadMessages[action.chatId]

        const mentionedBy = unreadMessagesForThisChat.find(msg => msg.text?.includes(bot.bot.botInfo.username) || msg.text?.includes(bot.bot.botInfo.first_name))
        if (mentionedBy) {
          agentState.messages.push(message.user(`AIRI System: You were mentioned in a message: ${mentionedBy.text} by ${mentionedBy.from?.first_name} (${mentionedBy.from?.username}), please respond as much as possible.`))
        }

        // Modified interruption logic
        if (chatId && chatId === action.chatId
          && unreadMessagesForThisChat
          && unreadMessagesForThisChat.length > 0) {
          const processingTime = bot.currentProcessingStartTime
            ? Date.now() - bot.currentProcessingStartTime
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
            currentMessages: agentState.messages,
            newMessages: unreadMessagesForThisChat,
            chatId: action.chatId,
          })

          if (shouldInterrupt) {
            bot.logger.withField('action', action).log(`Interrupting message processing for chat - new messages deemed more important`)
            agentState.messages.push(message.user(`AIRI System: Interrupting message processing for chat - new messages deemed more important`))
            return () => handleLoopStep(bot, agentState, chatId)
          }
          else {
            bot.logger.withField('action', action).log(`Continuing current processing despite new messages in chat`)
          }
        }
        if (!Array.isArray(unreadMessagesForThisChat)) {
          bot.logger.withField('action', action).log(`Unread messages for group is not an array - converting to array`)
          unreadMessagesForThisChat = []
        }
        if (unreadMessagesForThisChat.length === 0) {
          bot.logger.withField('action', action).log(`No unread messages for group - deleting`)
          delete bot.unreadMessages[action.chatId]
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

        const res = await readMessage(bot, bot.bot.botInfo.id.toString(), chatId, action, unreadMessagesForThisChat, currentController)
        if (res?.result) {
          bot.logger.log('message, read')
          agentState.actions.push({ action, result: res.result })
          return () => handleLoopStep(bot, agentState, chatId)
        }
        else {
          return
        }
      }
      case 'list_chats':
        agentState.actions.push({ action, result: `AIRI System: List of chats:${(await listJoinedChats()).map(chat => `ID:${chat.chat_id}, Name:${chat.chat_name}`).join('\n')}` })
        return () => handleLoopStep(bot, agentState, chatId)
      case 'send_message':
        agentState.actions.push({ action, result: `AIRI System: Sending message to group ${action.chatId}: ${action.content}` })
        await sendMessage(bot, action.content, action.chatId, currentController)
        return () => handleLoopStep(bot, agentState, chatId)
      case 'continue':
        agentState.actions.push({ action, result: 'AIRI System: Acknowledged, will now continue until next tick.' })
        return
      case 'break':
        agentState.messages = []
        agentState.actions = []
        agentState.actions.push({ action, result: 'AIRI System: Acknowledged, will now break, and clear out all existing memories, messages, actions. Left only this one.' })
        return
      case 'sleep':
        await sleep(30 * 1000)
        agentState.actions.push({ action, result: `AIRI System: Sleeping for ${30} seconds as requested...` })
        return () => handleLoopStep(bot, agentState, chatId)
      default:
        agentState.messages.push(message.user(`AIRI System: The action you sent ${action.action} haven't implemented yet by developer.`))
        return () => handleLoopStep(bot, agentState, chatId)
    }
  }
  catch (err) {
    if (err.name === 'AbortError') {
      bot.logger.log('Operation was aborted due to interruption')
      return
    }

    bot.logger.withError(err).log('Error occurred')
  }
  finally {
    // Clean up timing when done
    if (bot.currentAbortController === currentController) {
      bot.currentAbortController = null
      bot.currentProcessingStartTime = null
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

async function loopIteration(bot: BotSelf, agentState: AgentState, chatId?: string) {
  bot.logger.log('Starting loop iteration')
  let result = await handleLoopStep(bot, agentState, chatId)

  while (typeof result === 'function') {
    result = await result()
  }

  return result
}

function loopPeriodic(bot: BotSelf, agentState: AgentState) {
  setTimeout(() => {
    loopIteration(bot, agentState)
      .then(() => {})
      .catch((err) => {
        if (err.name === 'AbortError')
          bot.logger.log('main loop was aborted - restarting loop')
        else
          bot.logger.withError(err).log('error in main loop')
      })
      .finally(() => loopPeriodic(bot, agentState))
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

  return botSelf
}

async function onMessageArrival(state: BotSelf, agentState: AgentState) {
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
        loopIteration(state, agentState, nextMsg.message.chat.id.toString())
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
  const botObj = newBotSelf(bot, log)
  const agentState: AgentState = { actions: [], messages: [] }

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
      await interpretSticker(botObj.bot, ctx.message.reply_to_message, sticker)
      logger.withField('sticker', sticker).log('interpreted sticker')
    }

    await recordStickerPack(repliedSticker.set_name, stickerSet.name)
    await ctx.reply('Sticker pack added.')
  })

  bot.on('message:sticker', async (ctx) => {
    const messageId = `${ctx.message.chat.id}-${ctx.message.message_id}`
    if (!botObj.processedIds.has(messageId)) {
      botObj.processedIds.add(messageId)
      botObj.messageQueue.push({
        message: ctx.message,
        status: 'pending',
      })
    }

    onMessageArrival(botObj, agentState)
  })

  bot.on('message:photo', async (ctx) => {
    const messageId = `${ctx.message.chat.id}-${ctx.message.message_id}`
    if (!botObj.processedIds.has(messageId)) {
      botObj.processedIds.add(messageId)
      botObj.messageQueue.push({
        message: ctx.message,
        status: 'pending',
      })
    }

    onMessageArrival(botObj, agentState)
  })

  bot.on('message:text', async (ctx) => {
    const messageId = `${ctx.message.chat.id}-${ctx.message.message_id}`
    if (!botObj.processedIds.has(messageId)) {
      botObj.processedIds.add(messageId)
      botObj.messageQueue.push({
        message: ctx.message,
        status: 'ready',
      })
    }

    onMessageArrival(botObj, agentState)
  })

  bot.errorHandler = async err => log.withError(err).log('Error occurred')
  await bot.init()
  log.withField('bot_username', bot.botInfo.username).log('bot initialized')
  bot.start({ drop_pending_updates: true })

  try {
    loopPeriodic(botObj, agentState)
  }
  catch (err) {
    console.error(err)
  }
}
