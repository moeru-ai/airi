import type { ActionHandler, ActionResult } from '../definition'

import { useLogg } from '@guiiai/logg'

export const readMessagesAction: ActionHandler = {
  name: 'read_unread_messages',
  description: 'Read unread messages from a specific channel',
  execute: async (botContext, chatCtx, args): Promise<ActionResult> => {
    const logger = useLogg('readMessagesAction').useGlobalConfig()
    const channelId = args.channelId

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

    const formattedMessages = unreadEventsForThisChannel.map((event) => {
      const userName = event.user?.name || event.user?.id || 'Unknown'
      const content = event.message?.content || '[No content]'
      return `[${userName}]: ${content}`
    }).join('\n')

    delete botContext.unreadEvents[channelId]

    logger.log(`Read ${unreadEventsForThisChannel.length} unread events from channel ${channelId}`)

    return {
      success: true,
      shouldContinue: true,
      result: `AIRI System: Read ${unreadEventsForThisChannel.length} unread events from channel ${channelId}:\n${formattedMessages}`,
    }
  },
}
