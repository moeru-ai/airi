import type { SatoriClient } from '../../adapter/satori/client'
import type { ActionHandler } from '../definition'

import { useLogg } from '@guiiai/logg'

import { recordMessage } from '../../lib/db'

export function createSendMessageAction(client: SatoriClient): ActionHandler {
  return {
    name: 'send_message',
    execute: async (ctx, chatCtx, args) => {
      if (args.action !== 'send_message') {
        return {
          success: false,
          shouldContinue: true,
          result: 'System Error: Action mismatch for send_message.',
        }
      }
      const logger = useLogg('Action:send_message').useGlobalConfig()
      const { channelId, content } = args

      // Logic 1: Concurrency Safety Check
      if (ctx.unreadEvents[channelId] && ctx.unreadEvents[channelId].length > 0) {
        logger.withField('channelId', channelId).warn('Aborting message send due to new incoming events')

        return {
          success: false,
          shouldContinue: true,
          result: 'AIRI System: [INTERRUPT] Message sending ABORTED. New unread messages were detected from the user. Please [read_unread_messages] first to understand the new context.',
        }
      }

      try {
        // Logic 2: Execute Send
        await client.sendMessage(chatCtx.platform, chatCtx.selfId, channelId, content)

        // Logic 3: Persistence
        await recordMessage(channelId, chatCtx.selfId, 'AIRI', content)

        return {
          success: true,
          shouldContinue: true,
          result: `AIRI System: Message sent to ${channelId}: ${content}`,
        }
      }
      catch (error) {
        logger.withError(error as Error).error('Failed to send message')
        return {
          success: false,
          shouldContinue: true,
          result: `AIRI System: Error sending message: ${(error as Error).message}`,
        }
      }
    },
  }
}
