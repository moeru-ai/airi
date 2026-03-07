import type { MessageService } from '../services/messages'
import type { HonoEnv } from '../types/hono'

import { Hono } from 'hono'
import { safeParse } from 'valibot'

import { EditMessageSchema, SendMessagesSchema } from '../api/messages.schema'
import { authGuard } from '../middlewares/auth'
import { createBadRequestError } from '../utils/error'

export function createMessageRoutes(messageService: MessageService) {
  return new Hono<HonoEnv>()
    .use('*', authGuard)

    // Push messages (batch)
    .post('/:chatId/messages', async (c) => {
      const user = c.get('user')!
      const chatId = c.req.param('chatId')
      const body = await c.req.json()
      const result = safeParse(SendMessagesSchema, body)
      if (!result.success)
        throw createBadRequestError('Invalid request', 'INVALID_REQUEST', result.issues)

      const pushed = await messageService.pushMessages(user.id, chatId, result.output.messages)
      return c.json(pushed, 201)
    })

    // Pull messages (incremental)
    .get('/:chatId/messages', async (c) => {
      const user = c.get('user')!
      const chatId = c.req.param('chatId')
      const sinceSeq = Number(c.req.query('since_seq') ?? '0')
      const beforeSeq = c.req.query('before_seq') ? Number(c.req.query('before_seq')) : undefined
      const limit = Number(c.req.query('limit') ?? '50')

      const data = await messageService.pullMessages(user.id, chatId, {
        sinceSeq: Number.isNaN(sinceSeq) ? 0 : sinceSeq,
        beforeSeq: beforeSeq !== undefined && !Number.isNaN(beforeSeq) ? beforeSeq : undefined,
        limit: Number.isNaN(limit) ? 50 : limit,
      })

      return c.json(data)
    })

    // Edit message
    .patch('/:chatId/messages/:messageId', async (c) => {
      const user = c.get('user')!
      const chatId = c.req.param('chatId')
      const messageId = c.req.param('messageId')
      const body = await c.req.json()
      const result = safeParse(EditMessageSchema, body)
      if (!result.success)
        throw createBadRequestError('Invalid request', 'INVALID_REQUEST', result.issues)

      const updated = await messageService.editMessage(user.id, chatId, messageId, result.output.content)
      return c.json(updated)
    })

    // Delete message
    .delete('/:chatId/messages/:messageId', async (c) => {
      const user = c.get('user')!
      const chatId = c.req.param('chatId')
      const messageId = c.req.param('messageId')

      await messageService.deleteMessage(user.id, chatId, messageId)
      return c.json({ ok: true })
    })
}
