import type { ActionHandler, ActionResult } from '../definition'

import { useLogg } from '@guiiai/logg'

import { deleteUnreadEventsByIds } from '../../lib/db'

export const readMessagesAction: ActionHandler = {
  name: 'read_unread_messages',
  description: 'Read unread messages from a specific channel',
  execute: async (botContext, chatCtx, args): Promise<ActionResult> => {
    if (args.action !== 'read_unread_messages') {
      return {
        success: false,
        shouldContinue: true,
        result: 'System Error: Action mismatch for read_unread_messages.',
      }
    }
    const logger = useLogg('readMessagesAction').useGlobalConfig()
    const { channelId } = args

    if (!channelId) {
      return {
        success: false,
        shouldContinue: true,
        result: 'System Error: No channelId provided for read_unread_messages.',
      }
    }

    const unreadEventsForThisChannel = botContext.unreadEvents[channelId]

    if (!unreadEventsForThisChannel || unreadEventsForThisChannel.length === 0) {
      delete botContext.unreadEvents[channelId]
      return {
        success: true,
        shouldContinue: true,
        result: 'AIRI System: No unread messages found.',
      }
    }

    // Capture the IDs of the events we are about to "read"
    const readEventIds = unreadEventsForThisChannel.map(item => item.id)

    const formattedMessages = unreadEventsForThisChannel.map((item) => {
      const { event } = item
      const userName = event.user?.name || event.user?.id || 'Unknown'
      const content = event.message?.content || '[No content]'
      return `[${userName}]: ${content}`
    }).join('\n')

    // Only remove the events we just read, preserving any that might have arrived during processing
    botContext.unreadEvents[channelId] = (botContext.unreadEvents[channelId] || [])
      .filter(item => !readEventIds.includes(item.id))

    if (botContext.unreadEvents[channelId].length === 0) {
      delete botContext.unreadEvents[channelId]
    }

    await deleteUnreadEventsByIds(channelId, readEventIds)

    logger.log(`Read ${unreadEventsForThisChannel.length} unread events from channel ${channelId}`)

    return {
      success: true,
      shouldContinue: true,
      result: `AIRI System: Read ${unreadEventsForThisChannel.length} unread events from channel ${channelId}:\n${formattedMessages}`,
    }
  },
}
