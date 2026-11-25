import type { AttachmentService } from '../../services/domain/attachments'
import type { HonoEnv } from '../../types/hono'

import { createBadRequestError, created, ok } from '@proj-airi/http-shared'
import { CreateAttachmentRequestSchema } from '@proj-airi/server-sdk-shared/v2'
import { Hono } from 'hono'
import { safeParse } from 'valibot'

import { authGuard } from '../../middlewares/auth'
import { readJsonBody } from '../../services/domain/field-sync'

export function createAttachmentRoutes(attachmentService: AttachmentService) {
  return new Hono<HonoEnv>()
    .use('*', authGuard)
    .post('/', async (c) => {
      const body = await readJsonBody(c.req)
      const result = safeParse(CreateAttachmentRequestSchema, body)
      if (!result.success)
        throw createBadRequestError('Invalid Request', 'INVALID_REQUEST', result.issues)

      const upload = await attachmentService.createUpload(c.get('user')!.id, result.output)
      return created(c, upload)
    })
    .post('/:id/finalize', async (c) => {
      const attachment = await attachmentService.finalizeUpload(c.get('user')!.id, c.req.param('id'))
      return ok(c, attachment)
    })
    .get('/:id/download', async (c) => {
      return ok(c, await attachmentService.createDownload(c.get('user')!.id, c.req.param('id')))
    })
}
