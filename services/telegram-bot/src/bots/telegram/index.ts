import type { Logg } from '@guiiai/logg'
import type { Message } from 'grammy/types'

import type { Action, BotContext, ChatContext, ExtendedContext } from '../../types'

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
// import { shouldInterruptProcessing } from './agent/interruption'

async function dispatchAction(ctx: BotContext, action: Action, abortController: AbortController, chatCtx?: ChatContext) {
  // If action generation failed, don't proceed with further processing
  if (!action || !action.action) {
    ctx.logger.withField('action', action).log('No valid action returned.')
    if (chatCtx) {
      chatCtx.messages.push(message.user('AIRI System: No valid action returned.'))
      return () => handleLoopStep(ctx, chatCtx)
    }
    else {
      return
    }
  }

  switch (action.action) {
    case 'list_stickers':
    {
      if (chatCtx) {
        await ctx.bot.api.sendChatAction(chatCtx.chatId, 'choose_sticker')
      }

      const stickerPacks = await listStickerPacks()
      const stickerSets = await Promise.all(stickerPacks.map(s => ctx.bot.api.getStickerSet(s.platform_id)))
      const stickersIds = stickerSets.flatMap(s => s.stickers.map(sticker => sticker.file_id))
      const stickerDescriptions = await findStickersByFileIds(stickersIds)
      const stickerDescriptionsOneliner = stickerDescriptions.map(d => `Sticker File ID: ${d.file_id}, Description: ${d.description}`)

      if (chatCtx) {
        if (stickerDescriptionsOneliner.length === 0) {
          chatCtx.actions.push({ action, result: 'AIRI System: No stickers found in the current memory partition, preload of stickers is required, please ask for help.' })
        }
        else {
          chatCtx.actions.push({ action, result: `AIRI System: List of stickers:\n${stickerDescriptionsOneliner}` })
        }
      }

      return () => handleLoopStep(ctx, chatCtx)
    }
    case 'send_sticker':
    {
      const chatCtx = ensureChatContext(ctx, action.chatId)

      try {
        const file = await ctx.bot.api.getFile(action.fileId)
        if (!file) {
          chatCtx.actions.push({ action, result: `AIRI System: Error executing 'send_sticker': Sticker file ID ${action.fileId} not found, did you list the needed stickers before sending?` })
          return () => handleLoopStep(ctx, chatCtx)
        }
      }
      catch (err) {
        chatCtx.actions.push({ action, result: `AIRI System: Error executing 'send_sticker': Sticker file ID ${action.fileId} not found or failed due to ${String(err)}, did you list the needed stickers before sending?` })
        return () => handleLoopStep(ctx, chatCtx)
      }

      const sticker = await findStickerByFileId(action.fileId)
      chatCtx.actions.push({ action, result: `AIRI System: Sending sticker ${action.fileId} with (${sticker.emoji} in set ${sticker.name}) to ${action.chatId}` })
      await ctx.bot.api.sendSticker(action.chatId, action.fileId)

      return () => handleLoopStep(ctx, chatCtx)
    }
    case 'read_unread_messages':
    {
      const chatCtx = ensureChatContext(ctx, action.chatId)

      if (Object.keys(ctx.unreadMessages).length === 0) {
        ctx.logger.withField('action', action).log('No unread messages - deleting all unread messages')
        ctx.unreadMessages = {}
        break
      }
      if (action.chatId == null) {
        ctx.logger.withField('action', action).warn('No group ID - deleting all unread messages')
        break
      }

      let unreadMessagesForThisChat: Message[] | undefined = ctx.unreadMessages[action.chatId]

      const mentionedBy = unreadMessagesForThisChat.find(msg => msg.text?.includes(ctx.bot.botInfo.username) || msg.text?.includes(ctx.bot.botInfo.first_name))
      if (mentionedBy) {
        chatCtx.messages.push(message.user(`AIRI System: You were mentioned in a message: ${mentionedBy.text} by ${mentionedBy.from?.first_name} (${mentionedBy.from?.username}), please respond as much as possible.`))
      }

      if (!Array.isArray(unreadMessagesForThisChat)) {
        ctx.logger.withField('action', action).log(`Unread messages for group is not an array - converting to array`)
        unreadMessagesForThisChat = []
      }
      if (unreadMessagesForThisChat.length === 0) {
        ctx.logger.withField('action', action).log(`No unread messages for group - deleting`)
        delete ctx.unreadMessages[action.chatId]
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

      const res = await readMessage(ctx, ctx.bot.botInfo.id.toString(), chatCtx.chatId, action, unreadMessagesForThisChat, abortController)
      if (res?.result) {
        ctx.logger.log('message, read')
        chatCtx.actions.push({ action, result: res.result })
        return () => handleLoopStep(ctx, chatCtx)
      }
      else {
        return
      }
    }
    case 'list_chats':
      if (chatCtx) {
        chatCtx.actions.push({ action, result: `AIRI System: List of chats:${(await listJoinedChats()).map(chat => `ID:${chat.chat_id}, Name:${chat.chat_name}`).join('\n')}` })
      }

      return () => handleLoopStep(ctx, chatCtx)
    case 'send_message':
    {
      const chatCtx = ensureChatContext(ctx, action.chatId)
      chatCtx.actions.push({ action, result: `AIRI System: Sending message to group ${action.chatId}: ${action.content}` })
      await sendMessage(ctx, chatCtx, action.content, action.chatId, abortController)
      return () => handleLoopStep(ctx, chatCtx)
    }
    case 'continue':
      if (chatCtx) {
        chatCtx.actions.push({ action, result: 'AIRI System: Acknowledged, will now continue until next tick.' })
      }

      return
    case 'break':
      if (chatCtx) {
        chatCtx.messages = []
        chatCtx.actions = []
        chatCtx.actions.push({ action, result: 'AIRI System: Acknowledged, will now break, and clear out all existing memories, messages, actions. Left only this one.' })
      }

      return
    case 'sleep':
      await sleep(30 * 1000)
      if (chatCtx) {
        chatCtx.actions.push({ action, result: `AIRI System: Sleeping for ${30} seconds as requested...` })
      }

      return () => handleLoopStep(ctx, chatCtx)
    default:
      if (chatCtx) {
        chatCtx.messages.push(message.user(`AIRI System: The action you sent ${action.action} haven't implemented yet by developer.`))
      }

      return () => handleLoopStep(ctx, chatCtx)
  }
}

async function handleLoopStep(ctx: BotContext, chatCtx: ChatContext, incomingMessage?: Message): Promise<() => Promise<any> | undefined> {
  ctx.currentProcessingStartTime = Date.now()

  if (chatCtx?.currentAbortController) {
    chatCtx.currentAbortController.abort()
  }

  // // Create a new abort controller for this loop execution
  // const unreadMessagesForThisChat = ctx.unreadMessages[chatCtx.chatId]

  // if (unreadMessagesForThisChat && unreadMessagesForThisChat.length > 0) {
  //   const processingTime = ctx.currentProcessingStartTime
  //     ? Date.now() - ctx.currentProcessingStartTime
  //     : 0

  //   const messageCount = unreadMessagesForThisChat.length

  //   // Factors to consider for interruption:
  //   //
  //   // 1. How long we've been processing (longer = more likely to finish)
  //   // 2. Number of new messages (more = higher chance to interrupt)
  //   // 3. Message content importance (could be determined by LLM)
  //   const shouldInterrupt = await shouldInterruptProcessing({
  //     processingTime,
  //     messageCount,
  //     currentMessages: chatCtx.messages,
  //     newMessages: unreadMessagesForThisChat,
  //     chatId: chatCtx.chatId,
  //   })

  //   if (shouldInterrupt) {
  //     ctx.logger.withField('chat_id', chatCtx.chatId).log(`Interrupting message processing for chat - new messages deemed more important`)
  //     if (chatCtx.currentAbortController) {
  //       chatCtx.currentAbortController.abort()
  //     }
  //   }
  // }

  const currentController = new AbortController()
  if (chatCtx) {
    chatCtx.currentAbortController = currentController

    // Track message processing state
    if (chatCtx.chatId && !ctx.lastInteractedNChatIds.includes(chatCtx.chatId)) {
      ctx.lastInteractedNChatIds.push(chatCtx.chatId)
    }
    if (ctx.lastInteractedNChatIds.length > 5) {
      ctx.lastInteractedNChatIds = ctx.lastInteractedNChatIds.slice(-5)
    }

    if (chatCtx.messages == null) {
      chatCtx.messages = []
    }
    if (chatCtx.messages.length > 20) {
      const length = chatCtx.messages.length
      // pick the latest 5
      chatCtx.messages = chatCtx.messages.slice(-5)
      chatCtx.messages.push(message.user(`AIRI System: Approaching to system context limit, reducing... memory..., reduced from ${length} to ${chatCtx.messages.length}, history may lost.`))
    }

    if (chatCtx.actions == null) {
      chatCtx.actions = []
    }
    if (chatCtx.actions.length > 50) {
      const length = chatCtx.actions.length
      // pick the latest 20
      chatCtx.actions = chatCtx.actions.slice(-20)
      chatCtx.messages.push(message.user(`AIRI System: Approaching to system context limit, reducing... memory..., reduced from ${length} to ${chatCtx.actions.length}, history of actions may lost.`))
    }
  }

  try {
    const readUnreadMessagesActions: { index: number, actionState: typeof chatCtx.actions[number] }[] = []

    if (chatCtx) {
      for (const actionHistory of chatCtx.actions) {
        if (actionHistory.action.action === 'read_unread_messages') {
          readUnreadMessagesActions.push({ index: chatCtx.actions.indexOf(actionHistory), actionState: actionHistory })
        }
      }
    }

    readUnreadMessagesActions.map((item, index) => {
      if (index === readUnreadMessagesActions.length - 1) {
        return item
      }

      item.actionState.result = 'AIRI System: Please refer to the last read_unread_messages action for context.'
      return item
    })

    if (chatCtx) {
      for (const item of readUnreadMessagesActions) {
        chatCtx.actions[item.index] = item.actionState
      }
    }

    const action = await imagineAnAction(ctx.bot.botInfo.id.toString(), currentController, chatCtx?.messages || [], chatCtx?.actions || [], { unreadMessages: ctx.unreadMessages, incomingMessages: [incomingMessage] })
    return await dispatchAction(ctx, action, currentController, chatCtx)
  }
  catch (err) {
    if (err.name === 'AbortError') {
      ctx.logger.log('Operation was aborted due to interruption')
      return
    }

    ctx.logger.withError(err).log('Error occurred')
  }
  finally {
    // Clean up timing when done
    if (chatCtx && chatCtx.currentAbortController === currentController) {
      chatCtx.currentAbortController = undefined
      ctx.currentProcessingStartTime = undefined
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

async function loopIterationForChat(bot: BotContext, chatContext: ChatContext, incomingMessage: Message) {
  let result = await handleLoopStep(bot, chatContext, incomingMessage)

  while (typeof result === 'function') {
    result = await result()
  }

  return result
}

async function loopIterationPeriodicForExistingChat(ctx: BotContext) {
  for (const [chatId] of ctx.chats) {
    const chatCtx = ensureChatContext(ctx, chatId)

    const action = await imagineAnAction(ctx.bot.botInfo.id.toString(), chatCtx.currentAbortController, chatCtx.messages, chatCtx.actions, { unreadMessages: ctx.unreadMessages })
    let result = await dispatchAction(ctx, action, chatCtx.currentAbortController, chatCtx)

    while (typeof result === 'function') {
      result = await result()
    }
  }
}

async function loopIterationPeriodicWithNoChats(ctx: BotContext) {
  const abortController = new AbortController()
  const action = await imagineAnAction(ctx.bot.botInfo.id.toString(), abortController, [], [], { unreadMessages: ctx.unreadMessages })
  let result = await dispatchAction(ctx, action, abortController)

  while (typeof result === 'function') {
    result = await result()
  }
}

function loopPeriodic(botCtx: BotContext) {
  setTimeout(async () => {
    try {
      loopIterationPeriodicForExistingChat(botCtx)
      loopIterationPeriodicWithNoChats(botCtx)
    }
    catch (err) {
      if (err.name === 'AbortError')
        botCtx.logger.log('main loop was aborted - restarting loop')
      else
        botCtx.logger.withError(err).log('error in main loop')
    }
    finally {
      loopPeriodic(botCtx)
    }
  }, 60 * 1000)
}

function createBotContext(telegramBot: Bot, logger: Logg): BotContext {
  const botSelf: BotContext = {
    bot: telegramBot,
    messageQueue: [],
    unreadMessages: {},
    processedIds: new Set(),
    logger,
    processing: false,
    lastInteractedNChatIds: [],
    chats: new Map<string, ChatContext>(),
  }

  return botSelf
}

async function onMessageArrival(botContext: BotContext, chatCtx: ChatContext) {
  if (botContext.processing)
    return
  botContext.processing = true

  try {
    while (botContext.messageQueue.length > 0) {
      const nextMsg = botContext.messageQueue[0]

      // Don't process next messages until current one is ready
      if (nextMsg.status === 'pending') {
        if (nextMsg.message.sticker) {
          nextMsg.status = 'interpreting'
          await interpretSticker(botContext.bot, nextMsg.message, nextMsg.message.sticker)
          nextMsg.status = 'ready'
        }
        else if (nextMsg.message.photo) {
          nextMsg.status = 'interpreting'
          await interpretPhotos(botContext, nextMsg.message, nextMsg.message.photo)
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

        await recordMessage(botContext.bot.botInfo, nextMsg.message)

        let unreadMessagesForThisChat = botContext.unreadMessages[nextMsg.message.chat.id]

        if (unreadMessagesForThisChat == null) {
          botContext.logger.withField('chatId', nextMsg.message.chat.id).log('unread messages for this chat is null - creating empty array')
          unreadMessagesForThisChat = []
        }
        if (!Array.isArray(unreadMessagesForThisChat)) {
          botContext.logger.withField('chatId', nextMsg.message.chat.id).log('unread messages for this chat is not an array - converting to array')
          unreadMessagesForThisChat = []
        }

        unreadMessagesForThisChat.push(nextMsg.message)

        if (unreadMessagesForThisChat.length > 100) {
          unreadMessagesForThisChat = unreadMessagesForThisChat.slice(-100)
        }

        botContext.unreadMessages[nextMsg.message.chat.id] = unreadMessagesForThisChat
        botContext.logger.withField('chatId', nextMsg.message.chat.id).log('message queue processed, triggering immediate reaction')
        // Trigger immediate processing when messages are ready
        loopIterationForChat(botContext, chatCtx, nextMsg.message)
        botContext.messageQueue.shift()
      }
    }
  }
  catch (err) {
    botContext.logger.withError(err).log('Error occurred')
  }
  finally {
    botContext.processing = false
  }
}

function ensureChatContext(botCtx: BotContext, chatId: string): ChatContext {
  if (botCtx.chats.has(chatId)) {
    return botCtx.chats.get(chatId)!
  }

  const newChatContext: ChatContext = {
    chatId,
    currentTask: undefined,
    currentAbortController: undefined,
    messages: [],
    actions: [],
  }

  botCtx.chats.set(chatId, newChatContext)
  return newChatContext
}

export async function startTelegramBot() {
  const log = useLogg('Bot').useGlobalConfig()

  const telegramBot = new Bot<ExtendedContext>(env.TELEGRAM_BOT_TOKEN!)
  telegramBot.errorHandler = async err => log.withError(err).log('Error occurred')

  const botCtx = createBotContext(telegramBot, log)

  telegramBot.command('add_sticker_pack', async (ctx) => {
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
    const stickerSet = await telegramBot.api.getStickerSet(repliedSticker.set_name)

    logger.withField('sticker_set', repliedSticker.set_name).log('now will register the sticker set as known sticker set')

    for (const sticker of stickerSet.stickers) {
      logger.withField('sticker', sticker).log('interpreting sticker')
      await interpretSticker(botCtx.bot, ctx.message.reply_to_message, sticker)
      logger.withField('sticker', sticker).log('interpreted sticker')
    }

    await recordStickerPack(repliedSticker.set_name, stickerSet.name)
    await ctx.reply('Sticker pack added.')
  })

  telegramBot.on('message:sticker', async (ctx) => {
    const messageId = `${ctx.message.chat.id}-${ctx.message.message_id}`
    if (!botCtx.processedIds.has(messageId)) {
      botCtx.processedIds.add(messageId)
      botCtx.messageQueue.push({
        message: ctx.message,
        status: 'pending',
      })
    }

    const chatCtx = ensureChatContext(botCtx, ctx.message.chat.id.toString())
    onMessageArrival(botCtx, chatCtx)
  })

  telegramBot.on('message:photo', async (ctx) => {
    const messageId = `${ctx.message.chat.id}-${ctx.message.message_id}`
    if (!botCtx.processedIds.has(messageId)) {
      botCtx.processedIds.add(messageId)
      botCtx.messageQueue.push({
        message: ctx.message,
        status: 'pending',
      })
    }

    const chatCtx = ensureChatContext(botCtx, ctx.message.chat.id.toString())
    onMessageArrival(botCtx, chatCtx)
  })

  telegramBot.on('message:text', async (ctx) => {
    const messageId = `${ctx.message.chat.id}-${ctx.message.message_id}`
    if (!botCtx.processedIds.has(messageId)) {
      botCtx.processedIds.add(messageId)
      botCtx.messageQueue.push({
        message: ctx.message,
        status: 'ready',
      })
    }

    const chatCtx = ensureChatContext(botCtx, ctx.message.chat.id.toString())
    onMessageArrival(botCtx, chatCtx)
  })

  await telegramBot.init()
  log.withField('bot_username', telegramBot.botInfo.username).log('bot initialized')
  telegramBot.start({ drop_pending_updates: true })

  try {
    loopPeriodic(botCtx)
  }
  catch (err) {
    console.error(err)
  }
}
