import type { VoicePackService } from '../../../services/domain/voice-packs'
import type { HonoEnv } from '../../../types/hono'

import { Hono } from 'hono'
import { safeParse } from 'valibot'

import { adminGuard } from '../../../middlewares/admin-guard'
import { authGuard } from '../../../middlewares/auth'
import { CreateVoicePackInputSchema, UpdateVoicePackInputSchema } from '../../../services/domain/voice-packs'
import { createBadRequestError, createNotFoundError } from '../../../utils/error'

function parseIssues(issues: Array<{ path?: Array<{ key: unknown }>, message: string }>) {
  return issues.map(i => ({
    path: i.path?.map(p => p.key).join('.'),
    message: i.message,
  }))
}

/**
 * Admin CRUD routes for curated Voice Packs.
 *
 * Mounted at `/api/admin/voice-packs`. Disabling is soft (`enabled=false`) so
 * existing character-card snapshots never lose their historical definition.
 */
export function createAdminVoicePackRoutes(service: VoicePackService) {
  return new Hono<HonoEnv>()
    .use('*', authGuard)
    .use('*', adminGuard)
    .get('/', async (c) => {
      const packs = await service.list()
      return c.json(packs)
    })
    .post('/', async (c) => {
      const raw = await c.req.json().catch(() => null)
      if (raw == null)
        throw createBadRequestError('Request body must be JSON', 'INVALID_BODY')

      const parsed = safeParse(CreateVoicePackInputSchema, raw)
      if (!parsed.success)
        throw createBadRequestError('Invalid request body', 'INVALID_BODY', parseIssues(parsed.issues))

      const created = await service.create(parsed.output)
      return c.json(created, 201)
    })
    .patch('/:id', async (c) => {
      const raw = await c.req.json().catch(() => null)
      if (raw == null)
        throw createBadRequestError('Request body must be JSON', 'INVALID_BODY')

      const parsed = safeParse(UpdateVoicePackInputSchema, raw)
      if (!parsed.success)
        throw createBadRequestError('Invalid request body', 'INVALID_BODY', parseIssues(parsed.issues))

      const updated = await service.update(c.req.param('id'), parsed.output)
      if (!updated)
        throw createNotFoundError('Voice Pack not found')

      return c.json(updated)
    })
    .post('/:id/disable', async (c) => {
      const disabled = await service.disable(c.req.param('id'))
      if (!disabled)
        throw createNotFoundError('Voice Pack not found or already disabled')

      return c.json(disabled)
    })
}
