import type { BaseIssue, BaseSchema } from 'valibot'

import type { SyncedDocumentService } from '../../services/domain/synced-documents'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'
import { safeParse } from 'valibot'

import { authGuard } from '../../middlewares/auth'
import { createBadRequestError } from '../../utils/error'
import { CollectionSchema, DeleteDocumentQuerySchema, DocumentIdSchema, PushDocumentRequestSchema } from './schema'

function parseRequest<TOutput>(schema: BaseSchema<unknown, TOutput, BaseIssue<unknown>>, input: unknown) {
  const result = safeParse(schema, input)
  if (!result.success)
    throw createBadRequestError('Invalid Request', 'INVALID_REQUEST', result.issues)
  return result.output
}

export function createSyncRoutes(syncedDocumentService: SyncedDocumentService) {
  return new Hono<HonoEnv>()
    .use('*', authGuard)

    .get('/:collection', async (c) => {
      const user = c.get('user')!
      const collection = parseRequest(CollectionSchema, c.req.param('collection'))
      return c.json(await syncedDocumentService.list(user.id, collection))
    })

    .put('/:collection/:id', async (c) => {
      const user = c.get('user')!
      const collection = parseRequest(CollectionSchema, c.req.param('collection'))
      const documentId = parseRequest(DocumentIdSchema, c.req.param('id'))
      const { fields } = parseRequest(PushDocumentRequestSchema, await c.req.json())

      return c.json(await syncedDocumentService.push({ ownerId: user.id, collection, documentId }, fields))
    })

    .delete('/:collection/:id', async (c) => {
      const user = c.get('user')!
      const collection = parseRequest(CollectionSchema, c.req.param('collection'))
      const documentId = parseRequest(DocumentIdSchema, c.req.param('id'))
      const { revision } = parseRequest(DeleteDocumentQuerySchema, c.req.query())

      await syncedDocumentService.remove({ ownerId: user.id, collection, documentId }, revision)
      return c.body(null, 204)
    })
}
