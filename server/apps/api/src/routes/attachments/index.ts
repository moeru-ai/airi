import type { AttachmentService } from '../../services/domain/attachments'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'
import { safeParse } from 'valibot'

import { authGuard } from '../../middlewares/auth'
import { createBadRequestError } from '../../utils/error'
import { CreateAttachmentSchema } from './schema'

export function createAttachmentRoutes(attachmentService: AttachmentService) {
  return new Hono<HonoEnv>()
    .use('*', authGuard)
    .post('/', async (c) => {
      const body = await c.req.json()
      const result = safeParse(CreateAttachmentSchema, body)
      if (!result.success)
        throw createBadRequestError('Invalid Request', 'INVALID_REQUEST', result.issues)

      const created = await attachmentService.createUpload(c.get('user')!.id, result.output)
      return c.json(created, 201)
    })
    .post('/:id/finalize', async (c) => {
      const attachment = await attachmentService.finalizeUpload(c.get('user')!.id, c.req.param('id'))
      return c.json({ attachment })
    })
    .get('/:id/download', async (c) => {
      return c.json(await attachmentService.createDownload(c.get('user')!.id, c.req.param('id')))
    })
}
