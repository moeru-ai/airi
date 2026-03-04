import type { Logg } from '@guiiai/logg'

import type { SatoriClient } from '../../adapter/satori/client'
import type { SatoriEvent, SatoriReadyBody } from '../../adapter/satori/types'
import type { BotContext } from '../types'

import { onMessageArrival } from './scheduler'

/**
 * Set up the ready event handler
 * Logs connection information when Satori client is ready
 */
export function setupReadyEventHandler(
  satoriClient: SatoriClient,
  logger: Logg,
): void {
  satoriClient.onReady((ready: SatoriReadyBody) => {
    logger.log('Satori client ready:', ready)
    logger.log(`Connected to ${ready.logins.length} platform(s)`)

    for (const login of ready.logins) {
      logger.log(`- ${login.platform} (${login.self_id}): ${login.status}`)
    }
  })
}

/**
 * Set up the message-created event handler
 * Processes incoming messages, filters bot's own messages, and triggers bot responses
 */
export function setupMessageEventHandler(
  satoriClient: SatoriClient,
  botContext: BotContext,
  logger: Logg,
): void {
  satoriClient.on('message-created', async (event: SatoriEvent) => {
    const message = event.message
    if (!message) {
      return
    }

    logger.log(`Received message from ${event.user.id} in channel [${event.platform}] ${event.channel.id}: ${message.content}`)

    const messageId = `${event.channel.id}-${message.id}`
    if (!botContext.processedIds.has(messageId)) {
      botContext.processedIds.add(messageId)
    }
    else {
      logger.debug(`Skipping already processed message: ${messageId}`)
      return
    }

    // Add to message queue
    botContext.eventQueue.push({
      event,
      status: 'ready',
    })

    // Process message queue
    // Pass event so onMessageArrival can use correct channelId and set platform/selfId for each message
    await onMessageArrival(botContext, satoriClient)
  })
}
