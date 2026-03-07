import type { ConversationService } from '../services/conversations'
import type { HonoEnv } from '../types/hono'

import { Hono } from 'hono'
import { safeParse } from 'valibot'

import { AddMemberSchema, CreateConversationSchema, MarkReadSchema, UpdateConversationSchema } from '../api/conversations.schema'
import { authGuard } from '../middlewares/auth'
import { createBadRequestError } from '../utils/error'

export function createConversationRoutes(conversationService: ConversationService) {
  return new Hono<HonoEnv>()
    .use('*', authGuard)

    // Create conversation
    .post('/', async (c) => {
      const user = c.get('user')!
      const body = await c.req.json()
      const result = safeParse(CreateConversationSchema, body)
      if (!result.success)
        throw createBadRequestError('Invalid request', 'INVALID_REQUEST', result.issues)

      const conversation = await conversationService.create(user.id, result.output)
      return c.json(conversation, 201)
    })

    // List user's conversations
    .get('/', async (c) => {
      const user = c.get('user')!
      const conversations = await conversationService.list(user.id)
      return c.json({ conversations })
    })

    // Get conversation details
    .get('/:id', async (c) => {
      const user = c.get('user')!
      const conversation = await conversationService.get(user.id, c.req.param('id'))
      return c.json(conversation)
    })

    // Update conversation
    .patch('/:id', async (c) => {
      const user = c.get('user')!
      const body = await c.req.json()
      const result = safeParse(UpdateConversationSchema, body)
      if (!result.success)
        throw createBadRequestError('Invalid request', 'INVALID_REQUEST', result.issues)

      const updated = await conversationService.update(user.id, c.req.param('id'), result.output)
      return c.json(updated)
    })

    // Delete conversation
    .delete('/:id', async (c) => {
      const user = c.get('user')!
      await conversationService.remove(user.id, c.req.param('id'))
      return c.json({ ok: true })
    })

    // Add member
    .post('/:id/members', async (c) => {
      const user = c.get('user')!
      const body = await c.req.json()
      const result = safeParse(AddMemberSchema, body)
      if (!result.success)
        throw createBadRequestError('Invalid request', 'INVALID_REQUEST', result.issues)

      const member = await conversationService.addMember(user.id, c.req.param('id'), result.output)
      return c.json(member, 201)
    })

    // Remove member
    .delete('/:id/members/:memberId', async (c) => {
      const user = c.get('user')!
      await conversationService.removeMember(user.id, c.req.param('id'), c.req.param('memberId'))
      return c.json({ ok: true })
    })

    // Mark as read
    .post('/:id/read', async (c) => {
      const user = c.get('user')!
      const body = await c.req.json()
      const result = safeParse(MarkReadSchema, body)
      if (!result.success)
        throw createBadRequestError('Invalid request', 'INVALID_REQUEST', result.issues)

      await conversationService.markRead(user.id, c.req.param('id'), result.output.seq)
      return c.json({ ok: true })
    })
}
