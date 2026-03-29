import type { ChatService } from '../../services/chats'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'
import { safeParse } from 'valibot'

import { authGuard } from '../../middlewares/auth'
import { createBadRequestError } from '../../utils/error'
import { AddMemberSchema, CreateChatSchema, UpdateChatSchema } from './schema'

export function createChatRoutes(chatService: ChatService) {
  return new Hono<HonoEnv>()
    .use('*', authGuard)
    .post('/', async (c) => {
      const user = c.get('user')!
      const body = await c.req.json()
      const result = safeParse(CreateChatSchema, body)
      if (!result.success)
        throw createBadRequestError('Invalid Request', 'INVALID_REQUEST', result.issues)
      const chat = await chatService.createChat(user.id, result.output)
      return c.json(chat, 201)
    })
    .get('/', async (c) => {
      const user = c.get('user')!
      const chats = await chatService.listChats(user.id)
      return c.json({ chats })
    })
    .get('/:id', async (c) => {
      const user = c.get('user')!
      const chat = await chatService.getChat(user.id, c.req.param('id'))
      return c.json(chat)
    })
    .patch('/:id', async (c) => {
      const user = c.get('user')!
      const body = await c.req.json()
      const result = safeParse(UpdateChatSchema, body)
      if (!result.success)
        throw createBadRequestError('Invalid Request', 'INVALID_REQUEST', result.issues)
      const updated = await chatService.updateChat(user.id, c.req.param('id'), result.output)
      return c.json(updated)
    })
    .delete('/:id', async (c) => {
      const user = c.get('user')!
      const deleted = await chatService.deleteChat(user.id, c.req.param('id'))
      return c.json(deleted)
    })
    .post('/:id/members', async (c) => {
      const user = c.get('user')!
      const body = await c.req.json()
      const result = safeParse(AddMemberSchema, body)
      if (!result.success)
        throw createBadRequestError('Invalid Request', 'INVALID_REQUEST', result.issues)
      const added = await chatService.addMember(user.id, c.req.param('id'), result.output)
      return c.json(added)
    })
    .delete('/:id/members/:memberId', async (c) => {
      const user = c.get('user')!
      const removed = await chatService.removeMember(user.id, c.req.param('id'), c.req.param('memberId'))
      return c.json(removed)
    })
}
