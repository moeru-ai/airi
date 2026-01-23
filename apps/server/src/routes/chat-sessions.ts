import type { ChatSessionService } from '../services/chat-sessions'
import type { HonoEnv } from '../types/hono'

import { Hono } from 'hono'
import { safeParse } from 'valibot'

import { GetChatSessionsQuerySchema, SyncChatSessionsSchema } from '../api/chat-sessions.schema'
import { authGuard } from '../middlewares/auth'
import { createBadRequestError, createNotFoundError } from '../utils/error'

export function createChatSessionRoutes(service: ChatSessionService) {
  return new Hono<HonoEnv>()
    .use('*', authGuard)
    .post('/sync', async (c) => {
      const user = c.get('user')!
      const body = await c.req.json()
      const result = safeParse(SyncChatSessionsSchema, body)

      if (!result.success) {
        throw createBadRequestError('Invalid Request', 'INVALID_REQUEST', result.issues)
      }

      const synced = await service.syncSessions(user.id, result.output)
      return c.json(synced)
    })
    .get('/', async (c) => {
      const user = c.get('user')!
      const query = c.req.query()

      const result = safeParse(GetChatSessionsQuerySchema, query)
      if (!result.success) {
        throw createBadRequestError('Invalid Query', 'INVALID_QUERY', result.issues)
      }

      const sessions = await service.getSessions(user.id, result.output)
      return c.json(sessions)
    })
    .get('/:id', async (c) => {
      const user = c.get('user')!
      const id = c.req.param('id')
      const session = await service.getSession(user.id, id)

      if (!session) {
        throw createNotFoundError('Session not found')
      }

      return c.json(session)
    })
    .get('/:id/rag-export', async (c) => {
      const user = c.get('user')!
      const id = c.req.param('id')
      const data = await service.exportRagData(user.id, id)

      if (!data) {
        throw createNotFoundError('Session not found')
      }

      return c.json(data)
    })
}
