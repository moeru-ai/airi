import type { Message as LLMMessage } from '@xsai/shared-chat'

import type { SatoriClient } from '../../adapter/satori/client'
import type { SatoriEvent } from '../../adapter/satori/types'
import type { BotContext, ChatContext } from '../types'

import { getRecentMessages, pushToUnreadEvents, recordChannel, recordMessage, removeFromEventQueue, saveEventQueue } from '../../lib/db'
import {
  ACTIONS_KEEP_ON_TRIM,
  LOOP_CONTINUE_DELAY_MS,
  MAX_ACTIONS_IN_CONTEXT,
  MAX_LOOP_ITERATIONS,
  MAX_RECENT_INTERACTED_CHANNELS,
  MAX_UNREAD_EVENTS,
  PERIODIC_LOOP_INTERVAL_MS,
} from '../constants'
import { dispatchAction } from '../dispatcher'
import { imagineAnAction } from '../planner/llm-client'
import { ensureChatContext } from '../session/context'
import { trimActions } from '../utils'

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
  let shouldContinue = true
  let currentIncoming = incomingEvents
  let iterationCount = 0

  while (shouldContinue) {
    if (iterationCount >= MAX_LOOP_ITERATIONS) {
      ctx.logger
        .withField('channelId', chatCtx?.channelId)
        .withField('iterationCount', iterationCount)
        .log('Reached maximum loop iterations, breaking to prevent infinite loop')
      break
    }
    iterationCount++

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

      // Manage action context size
      chatCtx.actions ??= []
      chatCtx.actions = trimActions(chatCtx.actions, MAX_ACTIONS_IN_CONTEXT, ACTIONS_KEEP_ON_TRIM)
    }

    try {
      // Dynamic history injection: Fetch last 10 messages from DB
      const dbMessages = await getRecentMessages(chatCtx.channelId, 10)
      const llmMessages: LLMMessage[] = dbMessages.map(m => ({
        role: m.userId === chatCtx.selfId ? 'assistant' : 'user',
        content: m.content,
      }))

      const actionPayload = await imagineAnAction(
        currentController,
        llmMessages,
        chatCtx?.actions || [],
        {
          unreadEvents: ctx.unreadEvents,
          incomingEvents: currentIncoming ? [currentIncoming] : [],
        },
      )

      if (!actionPayload) {
        shouldContinue = false
        break
      }

      const result = await dispatchAction(ctx, chatCtx, actionPayload, currentController)
      shouldContinue = result.shouldContinue

      if (shouldContinue) {
        await new Promise(r => setTimeout(r, LOOP_CONTINUE_DELAY_MS))
        currentIncoming = undefined // Only the first step uses the initial incoming event
      }
    }
    catch (err) {
      if ((err as Error).name === 'AbortError') {
        ctx.logger.log('Operation was aborted due to interruption')
      }
      else {
        ctx.logger.withError(err as Error).log('Error occurred')
      }
      shouldContinue = false
    }
    finally {
      if (chatCtx && chatCtx.currentAbortController === currentController) {
        chatCtx.currentAbortController = undefined
        ctx.currentProcessingStartTime = undefined
      }
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
  // Directly await the loop process
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

  // Process channels in parallel but with their own locks
  for (const channelId of channelsWithUnread) {
    try {
      const chatCtx = await ensureChatContext(ctx, channelId)

      if (chatCtx.isProcessing) {
        ctx.logger.withField('channelId', channelId).debug('Channel is already processing, skipping periodic loop for this channel')
        continue
      }

      // Start processing for this channel in background
      chatCtx.isProcessing = true
      ;(async () => {
        try {
          await handleLoopStep(ctx, satoriClient, chatCtx)
        }
        catch (err) {
          ctx.logger.withError(err as Error).withField('channelId', channelId).log('Error processing channel in periodic loop')
        }
        finally {
          chatCtx.isProcessing = false
        }
      })()
    }
    catch (err) {
      ctx.logger.withError(err as Error).withField('channelId', channelId).log('Error ensuring chat context in periodic loop')
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

let isQueueConsumerRunning = false

/**
 * Handle message arrival event
 * Processes messages from the queue, records them, and triggers bot responses
 * Each message in the queue is processed with its own correct channelId and chatCtx
 */
export async function onMessageArrival(
  botContext: BotContext,
  satoriClient: SatoriClient,
) {
  if (isQueueConsumerRunning) {
    return
  }
  isQueueConsumerRunning = true

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

      // Protocol-side persistence: Record channel and message at the very beginning
      await recordChannel(
        channelId,
        currMsg.event.channel?.name || channelId,
        platform,
        selfId,
      )

      if (currMsg.event.user && currMsg.event.message?.content) {
        await recordMessage(
          channelId,
          sourceUserId,
          sourceUserName,
          currMsg.event.message.content,
        )
      }

      const chatCtx = await ensureChatContext(botContext, channelId)

      if (!chatCtx.platform || chatCtx.platform === '') {
        chatCtx.platform = platform
      }
      if (!chatCtx.selfId || chatCtx.selfId === '') {
        chatCtx.selfId = selfId
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
        if (currMsg.id) {
          await removeFromEventQueue(currMsg.id)
        }
        else {
          await saveEventQueue(botContext.eventQueue)
        }
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

      const unreadEventId = await pushToUnreadEvents(chatCtx.channelId, currMsg.event)
      unreadEventsForThisChannel.push({ id: unreadEventId, event: currMsg.event })

      if (unreadEventsForThisChannel.length > MAX_UNREAD_EVENTS) {
        unreadEventsForThisChannel = unreadEventsForThisChannel.slice(-MAX_UNREAD_EVENTS)
      }

      botContext.unreadEvents[chatCtx.channelId] = unreadEventsForThisChannel

      // Consume the event from queue immediately
      botContext.eventQueue.shift()
      if (currMsg.id) {
        await removeFromEventQueue(currMsg.id)
      }
      else {
        await saveEventQueue(botContext.eventQueue)
      }

      if (chatCtx.isProcessing) {
        botContext.logger.withField('channelId', chatCtx.channelId).log('Channel is already processing, added to unreadEvents only')
        continue
      }

      botContext.logger.withField('channelId', chatCtx.channelId).log('event queue processed, triggering immediate reaction')

      // Trigger immediate processing without awaiting to allow other channels to proceed
      chatCtx.isProcessing = true
      // We use a self-invoking async function to handle the processing and lock release
      ;(async () => {
        try {
          await loopIterationForChannel(botContext, satoriClient, chatCtx, currMsg.event)
        }
        catch (err) {
          botContext.logger.withError(err as Error).withField('channelId', chatCtx.channelId).log('Error in channel-specific loop')
        }
        finally {
          chatCtx.isProcessing = false
        }
      })()
    }
  }
  catch (err) {
    botContext.logger.withError(err as Error).log('Error occurred in onMessageArrival')
  }
  finally {
    isQueueConsumerRunning = false
  }
}
