import type { ContactService } from '../../services/domain/contacts'
import type { HonoEnv } from '../../types/hono'

import { PutCharacterDocumentSchema } from '@proj-airi/server-sdk-shared/contacts'
import { Hono } from 'hono'
import { literal, maxLength, minLength, pipe, safeParse, strictObject, string } from 'valibot'

import { authGuard } from '../../middlewares/auth'
import { createBadRequestError } from '../../utils/error'

const RegisterContactSchema = strictObject({
  characterId: pipe(string(), minLength(1), maxLength(128)),
})

const DeleteContactSchema = strictObject({
  deleteDirectConversations: literal(true),
})

/** Authenticated contact commands. Deletion requires explicit direct-history consent. */
export function createContactRoutes(service: ContactService) {
  return new Hono<HonoEnv>()
    .use('*', authGuard)
    .get('/', async (context) => {
      const contacts = await service.list(context.get('user')!.id)
      return context.json({ contacts })
    })
    .post('/', async (context) => {
      const result = safeParse(RegisterContactSchema, await context.req.json())
      if (!result.success)
        throw createBadRequestError('Invalid Request', 'INVALID_REQUEST', result.issues)
      const contact = await service.register(context.get('user')!.id, result.output.characterId)
      return context.json(contact, 201)
    })
    .put('/characters/:localId', async (context) => {
      const identity = safeParse(pipe(string(), minLength(1), maxLength(128)), context.req.param('localId'))
      const result = safeParse(PutCharacterDocumentSchema, await context.req.json())
      if (!identity.success || !result.success)
        throw createBadRequestError('Invalid private character command', 'INVALID_REQUEST')
      const contact = await service.putCharacter(context.get('user')!.id, identity.output, result.output)
      return context.json(contact)
    })
    .post('/characters/:localId/delete', async (context) => {
      const identity = safeParse(pipe(string(), minLength(1), maxLength(128)), context.req.param('localId'))
      const result = safeParse(DeleteContactSchema, await context.req.json())
      if (!identity.success || !result.success)
        throw createBadRequestError('Confirm deletion of direct conversations', 'INVALID_REQUEST')
      const deleted = await service.deleteCharacter(context.get('user')!.id, identity.output)
      return context.json(deleted)
    })
    .post('/:id/delete', async (context) => {
      const result = safeParse(DeleteContactSchema, await context.req.json())
      if (!result.success)
        throw createBadRequestError('Confirm deletion of direct conversations', 'INVALID_REQUEST', result.issues)
      const deleted = await service.deleteContact(context.get('user')!.id, context.req.param('id'))
      return context.json(deleted)
    })
}
