import type { DisplayModelService } from '../../services/domain/display-models'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'

import { authGuard } from '../../middlewares/auth'
import { DeleteDisplayModelQuerySchema, DisplayModelIdSchema, parseDisplayModelInput, RenameDisplayModelSchema, ReserveDisplayModelUploadSchema } from '../../services/domain/display-models'
import { readJsonBody } from '../../services/domain/field-sync'
import { createServiceUnavailableError } from '../../utils/error'

/**
 * Private display model sync routes, mounted at `/api/v1/display-models`.
 * The service is undefined when object storage is not configured.
 */
export function createDisplayModelRoutes(service: DisplayModelService | undefined) {
  return new Hono<HonoEnv>()
    .use('*', authGuard)
    .use('*', async (_c, next) => {
      if (!service)
        throw createServiceUnavailableError('Display model storage is not configured', 'STORAGE_UNAVAILABLE')
      await next()
    })

    .get('/', async (c) => {
      return c.json({ models: await service!.list(c.get('user')!.id) })
    })

    .post('/uploads', async (c) => {
      const input = parseDisplayModelInput(ReserveDisplayModelUploadSchema, await readJsonBody(c.req))
      return c.json(await service!.reserveUpload(c.get('user')!.id, input))
    })

    .post('/uploads/:uploadId/complete', async (c) => {
      return c.json(await service!.completeUpload(c.get('user')!.id, c.req.param('uploadId')))
    })

    .post('/:id/download', async (c) => {
      const id = parseDisplayModelInput(DisplayModelIdSchema, c.req.param('id'))
      return c.json(await service!.createDownload(c.get('user')!.id, id))
    })

    .patch('/:id', async (c) => {
      const id = parseDisplayModelInput(DisplayModelIdSchema, c.req.param('id'))
      const input = parseDisplayModelInput(RenameDisplayModelSchema, await readJsonBody(c.req))
      return c.json(await service!.rename(c.get('user')!.id, id, input.name, input.revision))
    })

    .delete('/:id', async (c) => {
      const id = parseDisplayModelInput(DisplayModelIdSchema, c.req.param('id'))
      const { revision } = parseDisplayModelInput(DeleteDisplayModelQuerySchema, c.req.query())
      await service!.remove(c.get('user')!.id, id, revision)
      return c.body(null, 204)
    })
}
