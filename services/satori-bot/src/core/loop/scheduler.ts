import type { SatoriClient } from '../../adapter/satori/client'
import type { SatoriEvent } from '../../adapter/satori/types'
import type { BotContext, ChatContext } from '../types'

import { recordChannel, recordMessage } from '../../lib/db'
import {
  ACTIONS_KEEP_ON_TRIM,
  LOOP_CONTINUE_DELAY_MS,
  MAX_ACTIONS_IN_CONTEXT,
  MAX_MESSAGES_IN_CONTEXT,
  MAX_RECENT_INTERACTED_CHANNELS,
  MAX_UNREAD_EVENTS,
  MESSAGES_KEEP_ON_TRIM,
  PERIODIC_LOOP_INTERVAL_MS,
} from '../constants'
import { dispatchAction } from '../dispatcher'
import { imagineAnAction } from '../planner/llm-client'
import { ensureChatContext } from '../session/context'

/**
 * Handle a single loop step
 * Manages context size, calls LLM for action, and dispatches the action
 */
export async function handleLoopStep(
  ctx: BotContext,
  satoriClient: SatoriClient,
  chatCtx: ChatContext,
  incomingEvents?: SatoriEvent,
): Promise<void> {
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
    if (ctx.lastInteractedChannelIds.length > MAX_RECENT_INTERACTED_CHANNELS) {
      ctx.lastInteractedChannelIds = ctx.lastInteractedChannelIds.slice(-MAX_RECENT_INTERACTED_CHANNELS)
    }

    // Manage context size
    if (chatCtx.messages == null) {
      chatCtx.messages = []
    }
    if (chatCtx.messages.length > MAX_MESSAGES_IN_CONTEXT) {
      const length = chatCtx.messages.length
      chatCtx.messages = chatCtx.messages.slice(-MESSAGES_KEEP_ON_TRIM)
      chatCtx.messages.push({
        role: 'user',
        content: `AIRI System: Approaching to system context limit, reducing... memory..., reduced from ${length} to ${chatCtx.messages.length}, history may be lost.`,
      })
    }

    if (chatCtx.actions == null) {
      chatCtx.actions = []
    }
    if (chatCtx.actions.length > MAX_ACTIONS_IN_CONTEXT) {
      const length = chatCtx.actions.length
      chatCtx.actions = chatCtx.actions.slice(-ACTIONS_KEEP_ON_TRIM)
      chatCtx.messages.push({
        role: 'user',
        content: `AIRI System: Approaching to system context limit, reducing... memory..., reduced from ${length} to ${chatCtx.actions.length}, history of actions may be lost.`,
      })
    }
  }

  try {
    const actionPayload = await imagineAnAction(
      currentController,
      chatCtx?.messages || [],
      chatCtx?.actions || [],
      {
        unreadEvents: ctx.unreadEvents,
        incomingEvents: incomingEvents ? [incomingEvents] : [],
      },
    )

    const result = await dispatchAction(ctx, chatCtx, actionPayload, currentController)
    if (result.shouldContinue) {
      await new Promise(r => setTimeout(r, LOOP_CONTINUE_DELAY_MS))
      // Recursively call next step and await it
      await handleLoopStep(ctx, satoriClient, chatCtx)
    }
  }
  catch (err) {
    if ((err as Error).name === 'AbortError') {
      ctx.logger.log('Operation was aborted due to interruption')
      return
    }

    ctx.logger.withError(err as Error).log('Error occurred')
  }
  finally {
    if (chatCtx && chatCtx.currentAbortController === currentController) {
      chatCtx.currentAbortController = undefined
      ctx.currentProcessingStartTime = undefined
    }
  }
}

/**
 * Process a loop iteration for a specific channel with an incoming message
 * Continues processing until no more continuation functions are returned
 */
export async function loopIterationForChannel(
  bot: BotContext,
  satoriClient: SatoriClient,
  chatContext: ChatContext,
  incomingEvent: SatoriEvent,
) {
  // Directly await the recursive process
  await handleLoopStep(bot, satoriClient, chatContext, incomingEvent)
}

/**
 * Process periodic loop iteration for existing channels with unread messages
 * Only processes channels that have unread messages to avoid unnecessary LLM calls
 */
async function loopIterationPeriodicForExistingChannels(ctx: BotContext, satoriClient: SatoriClient) {
  // Only process channels with unread messages to avoid unnecessary LLM calls
  const channelsWithUnread = Object.keys(ctx.unreadEvents).filter(
    channelId => ctx.unreadEvents[channelId]?.length > 0,
  )

  if (channelsWithUnread.length === 0) {
    ctx.logger.log('No channels with unread events, skipping periodic check')
    return
  }

  ctx.logger.withField('channelCount', channelsWithUnread.length).log('Processing channels with unread events')

  // Process channels sequentially to avoid overwhelming the LLM API
  for (const channelId of channelsWithUnread) {
    try {
      const chatCtx = await ensureChatContext(ctx, channelId)
      await handleLoopStep(ctx, satoriClient, chatCtx)
    }
    catch (err) {
      ctx.logger.withError(err as Error).withField('channelId', channelId).log('Error processing channel in periodic loop')
      // Continue to next channel instead of breaking the entire loop
      continue
    }
  }
}

/**
 * Periodic loop function that runs every PERIODIC_LOOP_INTERVAL_MS
 * Recursively schedules itself to continue running
 */
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
  }, PERIODIC_LOOP_INTERVAL_MS)
}

/**
 * Start the periodic loop
 * Begins the recursive periodic processing of channels with unread messages
 */
export function startPeriodicLoop(botCtx: BotContext, satoriClient: SatoriClient) {
  loopPeriodic(botCtx, satoriClient)
}

/**
 * Handle message arrival event
 * Processes messages from the queue, records them, and triggers bot responses
 * Each message in the queue is processed with its own correct channelId and chatCtx
 */
export async function onMessageArrival(
  botContext: BotContext,
  satoriClient: SatoriClient,
) {
  if (botContext.processing) {
    return
  }
  botContext.processing = true

  const log = botContext.logger

  try {
    while (botContext.eventQueue.length > 0) {
      const currMsg = botContext.eventQueue[0]
      if (currMsg.status !== 'ready')
        break

      const channelId = currMsg.event.channel?.id || 'unknown'
      const platform = currMsg.event.platform || 'unknown'
      const selfId = currMsg.event.self_id || currMsg.event.login?.self_id || 'unknown'
      const sourceUserId = currMsg.event.user?.id || currMsg.event.member?.user?.id
      const sourceUserName = currMsg.event.user?.name || currMsg.event.member?.user?.name || 'unknown'

      const chatCtx = await ensureChatContext(botContext, channelId)

      if (!chatCtx.platform || chatCtx.platform === '') {
        chatCtx.platform = platform
      }
      if (!chatCtx.selfId || chatCtx.selfId === '') {
        chatCtx.selfId = selfId
      }

      // Record channel
      await recordChannel(
        chatCtx.channelId,
        currMsg.event.channel?.name || chatCtx.channelId,
        chatCtx.platform,
        chatCtx.selfId,
      )

      // Record message
      if (currMsg.event.user && currMsg.event.message?.content) {
        await recordMessage(
          chatCtx.channelId,
          currMsg.event.user.id,
          currMsg.event.user.name || currMsg.event.user.id,
          currMsg.event.message.content,
        )
      }

      // Skip bot's own messages - don't add them to unreadEvents
      if (sourceUserId === chatCtx.selfId) {
        botContext.logger
          .withFields({
            channelId: chatCtx.channelId,
            sourceUserId: currMsg.event.user?.id || currMsg.event.member?.user?.id,
            selfId: chatCtx.selfId,
            messageId: currMsg.event.id,
          })
          .debug('[DEBUG] Skipping bot\'s own event in unreadEvents - filtered out')
        botContext.eventQueue.shift()
        continue
      }

      let unreadEventsForThisChannel = botContext.unreadEvents[chatCtx.channelId]

      if (unreadEventsForThisChannel == null) {
        botContext.logger.withField('channelId', chatCtx.channelId).log('unread events for this channel is null - creating empty array')
        unreadEventsForThisChannel = []
      }
      if (!Array.isArray(unreadEventsForThisChannel)) {
        botContext.logger.withField('channelId', chatCtx.channelId).log('unread events for this channel is not an array - converting to array')
        unreadEventsForThisChannel = []
      }

      unreadEventsForThisChannel.push(currMsg.event)

      if (unreadEventsForThisChannel.length > MAX_UNREAD_EVENTS) {
        unreadEventsForThisChannel = unreadEventsForThisChannel.slice(-MAX_UNREAD_EVENTS)
      }

      botContext.unreadEvents[chatCtx.channelId] = unreadEventsForThisChannel

      botContext.logger.withField('channelId', chatCtx.channelId).log('event queue processed, triggering immediate reaction')

      // Trigger immediate processing with the correct chatCtx for this message
      await loopIterationForChannel(botContext, satoriClient, chatCtx, currMsg.event)
      botContext.eventQueue.shift()
    }
  }
  catch (err) {
    botContext.logger.withError(err as Error).log('Error occurred')
  }
  finally {
    botContext.processing = false
  }
}
