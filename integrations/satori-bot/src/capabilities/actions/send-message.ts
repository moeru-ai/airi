import type { SatoriClient } from '../../adapter/satori/client'
import type { ActionHandler } from '../definition'

import { useLogg } from '@guiiai/logg'

import { recordMessage } from '../../lib/db'

export function createSendMessageAction(client: SatoriClient): ActionHandler {
  return {
    execute: async (ctx, chatCtx, args) => {
      if (args.action !== 'send_message') {
        return {
          result: 'System Error: Action mismatch for send_message.',
          shouldContinue: true,
          success: false,
        }
      }
      const logger = useLogg('Action:send_message').useGlobalConfig()
      const { channelId, content } = args

      // Logic 1: Concurrency Safety Check
      if (ctx.unreadEvents[channelId] && ctx.unreadEvents[channelId].length > 0) {
        logger.withField('channelId', channelId).warn('Aborting message send due to new incoming events')

        return {
          result: 'AIRI System: [INTERRUPT] Message sending ABORTED. New unread messages were detected from the user. Please [read_unread_messages] first to understand the new context.',
          shouldContinue: true,
          success: false,
        }
      }

      try {
        // Logic 2: Execute Send
        await client.sendMessage(chatCtx.platform, chatCtx.selfId, channelId, content)

        // Logic 3: Persistence
        await recordMessage(channelId, chatCtx.selfId, 'AIRI', content)

        return {
          result: `AIRI System: Message sent to ${channelId}: ${content}`,
          shouldContinue: true,
          success: true,
        }
      }
      catch (error) {
        logger.withError(error as Error).error('Failed to send message')
        return {
          result: `AIRI System: Error sending message: ${(error as Error).message}`,
          shouldContinue: true,
          success: false,
        }
      }
    },
    name: 'send_message',
  }
}
