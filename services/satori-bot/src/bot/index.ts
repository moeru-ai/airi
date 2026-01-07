import type { Logg } from '@guiiai/logg'

import type { SatoriClient } from '../client/satori-client'
import type { Action, BotContext, ChatContext } from '../types/bot'
import type { SatoriMessage } from '../types/satori'

import { readUnreadMessages } from '../actions/read-unread-messages'
import { sendMessage } from '../actions/send-message'
import { listChannels, recordChannel, recordMessage } from '../db'
import { imagineAnAction } from '../llm/actions'

async function dispatchAction(
  ctx: BotContext,
  satoriClient: SatoriClient,
  action: Action,
  abortController: AbortController,
  chatCtx?: ChatContext,
): Promise<(() => Promise<any>) | undefined> {
  // If action generation failed, don't proceed
  if (!action || !action.action) {
    ctx.logger.withField('action', action).log('No valid action returned.')
    if (chatCtx) {
      chatCtx.messages.push({
        role: 'user',
        content: 'AIRI System: No valid action returned.',
      })
      return () => handleLoopStep(ctx, satoriClient, chatCtx)
    }
    return undefined
  }

  switch (action.action) {
    case 'list_channels': {
      if (chatCtx) {
        const channels = await listChannels()
        const channelList = channels.map(c => `ID:${c.id}, Name:${c.name}, Platform:${c.platform}`).join('\n')
        chatCtx.actions.push({
          action,
          result: `AIRI System: List of channels:\n${channelList}`,
        })
      }
      return () => handleLoopStep(ctx, satoriClient, chatCtx)
    }

    case 'send_message': {
      const chatCtx = await ensureChatContext(ctx, action.channelId)
      chatCtx.actions.push({
        action,
        result: `AIRI System: Sending message to channel ${action.channelId}: ${action.content}`,
      })
      await sendMessage(ctx, chatCtx, satoriClient, action.content, action.channelId, abortController)
      return () => handleLoopStep(ctx, satoriClient, chatCtx)
    }

    case 'read_unread_messages': {
      const chatCtx = await ensureChatContext(ctx, action.channelId)
      const res = await readUnreadMessages(ctx, chatCtx, action)
      if (res?.result) {
        ctx.logger.log('Messages read')
        chatCtx.actions.push({ action, result: res.result })
        return () => handleLoopStep(ctx, satoriClient, chatCtx)
      }
      return undefined
    }

    case 'continue':
      if (chatCtx) {
        chatCtx.actions.push({
          action,
          result: 'AIRI System: Acknowledged, will now continue until next tick.',
        })
      }
      return undefined

    case 'break':
      if (chatCtx) {
        chatCtx.messages = []
        chatCtx.actions = []
        chatCtx.actions.push({
          action,
          result: 'AIRI System: Acknowledged, will now break, and clear out all existing memories, messages, actions.',
        })
      }
      return undefined

    case 'sleep':
      await new Promise(resolve => setTimeout(resolve, 30 * 1000))
      if (chatCtx) {
        chatCtx.actions.push({
          action,
          result: 'AIRI System: Sleeping for 30 seconds as requested...',
        })
      }
      return () => handleLoopStep(ctx, satoriClient, chatCtx)

    default:
      if (chatCtx) {
        chatCtx.messages.push({
          role: 'user',
          content: `AIRI System: The action ${(action as any).action} hasn't been implemented yet by developer.`,
        })
      }
      return () => handleLoopStep(ctx, satoriClient, chatCtx)
  }
}

async function handleLoopStep(
  ctx: BotContext,
  satoriClient: SatoriClient,
  chatCtx: ChatContext,
  incomingMessage?: SatoriMessage,
): Promise<(() => Promise<any>) | undefined> {
  ctx.currentProcessingStartTime = Date.now()

  if (chatCtx?.currentAbortController) {
    chatCtx.currentAbortController.abort()
  }

  const currentController = new AbortController()
  if (chatCtx) {
    chatCtx.currentAbortController = currentController

    // Track message processing state
    if (chatCtx.channelId && !ctx.lastInteractedChannelIds.includes(chatCtx.channelId)) {
      ctx.lastInteractedChannelIds.push(chatCtx.channelId)
    }
    if (ctx.lastInteractedChannelIds.length > 5) {
      ctx.lastInteractedChannelIds = ctx.lastInteractedChannelIds.slice(-5)
    }

    // Manage context size
    if (chatCtx.messages == null) {
      chatCtx.messages = []
    }
    if (chatCtx.messages.length > 20) {
      const length = chatCtx.messages.length
      chatCtx.messages = chatCtx.messages.slice(-5)
      chatCtx.messages.push({
        role: 'user',
        content: `AIRI System: Approaching to system context limit, reducing... memory..., reduced from ${length} to ${chatCtx.messages.length}, history may be lost.`,
      })
    }

    if (chatCtx.actions == null) {
      chatCtx.actions = []
    }
    if (chatCtx.actions.length > 50) {
      const length = chatCtx.actions.length
      chatCtx.actions = chatCtx.actions.slice(-20)
      chatCtx.messages.push({
        role: 'user',
        content: `AIRI System: Approaching to system context limit, reducing... memory..., reduced from ${length} to ${chatCtx.actions.length}, history of actions may be lost.`,
      })
    }
  }

  try {
    const action = await imagineAnAction(
      currentController,
      chatCtx?.messages || [],
      chatCtx?.actions || [],
      {
        unreadMessages: ctx.unreadMessages,
        incomingMessages: incomingMessage ? [incomingMessage] : [],
      },
    )
    return await dispatchAction(ctx, satoriClient, action, currentController, chatCtx)
  }
  catch (err) {
    if ((err as Error).name === 'AbortError') {
      ctx.logger.log('Operation was aborted due to interruption')
      return undefined
    }

    ctx.logger.withError(err as Error).log('Error occurred')
    return undefined
  }
  finally {
    if (chatCtx && chatCtx.currentAbortController === currentController) {
      chatCtx.currentAbortController = undefined
      ctx.currentProcessingStartTime = undefined
    }
  }
}

async function loopIterationForChannel(
  bot: BotContext,
  satoriClient: SatoriClient,
  chatContext: ChatContext,
  incomingMessage: SatoriMessage,
) {
  let result = await handleLoopStep(bot, satoriClient, chatContext, incomingMessage)

  while (typeof result === 'function') {
    result = await result()
  }

  return result
}

async function loopIterationPeriodicForExistingChannels(ctx: BotContext, satoriClient: SatoriClient) {
  // Only process channels with unread messages to avoid unnecessary LLM calls
  const channelsWithUnread = Object.keys(ctx.unreadMessages).filter(
    channelId => ctx.unreadMessages[channelId]?.length > 0,
  )

  if (channelsWithUnread.length === 0) {
    ctx.logger.log('No channels with unread messages, skipping periodic check')
    return
  }

  ctx.logger.withField('channelCount', channelsWithUnread.length).log('Processing channels with unread messages')

  // Process channels sequentially to avoid overwhelming the LLM API
  for (const channelId of channelsWithUnread) {
    const chatCtx = await ensureChatContext(ctx, channelId)

    try {
      const action = await imagineAnAction(
        chatCtx.currentAbortController,
        chatCtx.messages,
        chatCtx.actions,
        { unreadMessages: ctx.unreadMessages },
      )
      let result = await dispatchAction(ctx, satoriClient, action, chatCtx.currentAbortController, chatCtx)

      while (typeof result === 'function') {
        result = await result()
      }
    }
    catch (err) {
      ctx.logger.withError(err as Error).withField('channelId', channelId).log('Error processing channel in periodic loop')
      // Continue to next channel instead of breaking the entire loop
    }
  }
}

function loopPeriodic(botCtx: BotContext, satoriClient: SatoriClient) {
  setTimeout(async () => {
    try {
      await loopIterationPeriodicForExistingChannels(botCtx, satoriClient)
    }
    catch (err) {
      if ((err as Error).name === 'AbortError') {
        botCtx.logger.log('main loop was aborted - restarting loop')
      }
      else {
        botCtx.logger.withError(err as Error).log('error in main loop')
      }
    }
    finally {
      loopPeriodic(botCtx, satoriClient)
    }
  }, 60 * 1000)
}

export function createBotContext(logger: Logg): BotContext {
  const botSelf: BotContext = {
    messageQueue: [],
    unreadMessages: {},
    processedIds: new Set(),
    logger,
    processing: false,
    lastInteractedChannelIds: [],
    chats: new Map<string, ChatContext>(),
  }

  return botSelf
}

export async function onMessageArrival(
  botContext: BotContext,
  satoriClient: SatoriClient,
  chatCtx: ChatContext,
) {
  if (botContext.processing) {
    return
  }
  botContext.processing = true

  try {
    while (botContext.messageQueue.length > 0) {
      const nextMsg = botContext.messageQueue[0]

      if (nextMsg.status === 'ready') {
        // Record channel (use chatCtx.channelId which is already correctly set)
        await recordChannel(
          chatCtx.channelId,
          nextMsg.message.channel?.name || chatCtx.channelId,
          chatCtx.platform,
          chatCtx.selfId,
        )

        // Record message
        if (nextMsg.message.user && nextMsg.message.content) {
          await recordMessage(
            chatCtx.channelId,
            nextMsg.message.user.id,
            nextMsg.message.user.name || nextMsg.message.user.id,
            nextMsg.message.content,
          )
        }

        let unreadMessagesForThisChannel = botContext.unreadMessages[chatCtx.channelId]

        if (unreadMessagesForThisChannel == null) {
          botContext.logger.withField('channelId', chatCtx.channelId).log('unread messages for this channel is null - creating empty array')
          unreadMessagesForThisChannel = []
        }
        if (!Array.isArray(unreadMessagesForThisChannel)) {
          botContext.logger.withField('channelId', chatCtx.channelId).log('unread messages for this channel is not an array - converting to array')
          unreadMessagesForThisChannel = []
        }

        unreadMessagesForThisChannel.push(nextMsg.message)

        if (unreadMessagesForThisChannel.length > 100) {
          unreadMessagesForThisChannel = unreadMessagesForThisChannel.slice(-100)
        }

        botContext.unreadMessages[chatCtx.channelId] = unreadMessagesForThisChannel
        botContext.logger.withField('channelId', chatCtx.channelId).log('message queue processed, triggering immediate reaction')

        // Trigger immediate processing
        await loopIterationForChannel(botContext, satoriClient, chatCtx, nextMsg.message)
        botContext.messageQueue.shift()
      }
    }
  }
  catch (err) {
    botContext.logger.withError(err as Error).log('Error occurred')
  }
  finally {
    botContext.processing = false
  }
}

export async function ensureChatContext(botCtx: BotContext, channelId: string): Promise<ChatContext> {
  if (botCtx.chats.has(channelId)) {
    return botCtx.chats.get(channelId)!
  }

  // Try to get channel info from database
  const channels = await listChannels()
  const channelInfo = channels.find(c => c.id === channelId)

  const newChatContext: ChatContext = {
    channelId,
    platform: channelInfo?.platform || '',
    selfId: channelInfo?.selfId || '',
    currentTask: undefined,
    currentAbortController: undefined,
    messages: [],
    actions: [],
  }

  botCtx.chats.set(channelId, newChatContext)
  return newChatContext
}

export function startPeriodicLoop(botCtx: BotContext, satoriClient: SatoriClient) {
  loopPeriodic(botCtx, satoriClient)
}
