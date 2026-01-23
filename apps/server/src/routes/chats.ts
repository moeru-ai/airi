import type { ChatService } from '../services/chats'
import type { HonoEnv } from '../types/hono'

import { Hono } from 'hono'
import { safeParse } from 'valibot'

import { ChatSyncSchema } from '../api/chats.schema'
import { authGuard } from '../middlewares/auth'
import { createBadRequestError } from '../utils/error'

export function createChatRoutes(chatService: ChatService) {
  return new Hono<HonoEnv>()
    .use('*', authGuard)
    .post('/sync', async (c) => {
      const user = c.get('user')!

      const body = await c.req.json()
      const result = safeParse(ChatSyncSchema, body)

      if (!result.success)
        throw createBadRequestError('Invalid Request', 'INVALID_REQUEST', result.issues)

      const synced = await chatService.syncChat(user.id, result.output)
      return c.json(synced)
    })
}
