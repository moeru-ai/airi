import type { ProductEventService } from '../../../services/domain/product-events'
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
export function createAdminVoicePackRoutes(deps: {
  productEventService: ProductEventService
  service: VoicePackService
}) {
  return new Hono<HonoEnv>()
    .use('*', authGuard)
    .use('*', adminGuard)
    .get('/', async (c) => {
      const packs = await deps.service.list()
      return c.json(packs)
    })
    .post('/', async (c) => {
      const user = c.get('user')!
      const raw = await c.req.json().catch(() => null)
      if (raw == null)
        throw createBadRequestError('Request body must be JSON', 'INVALID_BODY')

      const parsed = safeParse(CreateVoicePackInputSchema, raw)
      if (!parsed.success)
        throw createBadRequestError('Invalid request body', 'INVALID_BODY', parseIssues(parsed.issues))

      const created = await deps.service.create(parsed.output)
      void deps.productEventService.track({
        userId: user.id,
        feature: 'voice_pack',
        action: 'voice_pack_created',
        status: 'succeeded',
        source: 'admin.voice_packs',
        metadata: {
          voice_pack_id: created.id,
          provider: created.provider,
          model: created.model,
          tts_model_id: created.ttsModelId,
          cost_multiplier: created.costMultiplier,
        },
      })
      return c.json(created, 201)
    })
    .patch('/:id', async (c) => {
      const user = c.get('user')!
      const raw = await c.req.json().catch(() => null)
      if (raw == null)
        throw createBadRequestError('Request body must be JSON', 'INVALID_BODY')

      const parsed = safeParse(UpdateVoicePackInputSchema, raw)
      if (!parsed.success)
        throw createBadRequestError('Invalid request body', 'INVALID_BODY', parseIssues(parsed.issues))

      const updated = await deps.service.update(c.req.param('id'), parsed.output)
      if (!updated)
        throw createNotFoundError('Voice Pack not found')

      void deps.productEventService.track({
        userId: user.id,
        feature: 'voice_pack',
        action: 'voice_pack_updated',
        status: 'succeeded',
        source: 'admin.voice_packs',
        metadata: {
          voice_pack_id: updated.id,
          provider: updated.provider,
          model: updated.model,
          tts_model_id: updated.ttsModelId,
          cost_multiplier: updated.costMultiplier,
          enabled: updated.enabled,
        },
      })
      return c.json(updated)
    })
    .post('/:id/disable', async (c) => {
      const user = c.get('user')!
      const disabled = await deps.service.disable(c.req.param('id'))
      if (!disabled)
        throw createNotFoundError('Voice Pack not found or already disabled')

      void deps.productEventService.track({
        userId: user.id,
        feature: 'voice_pack',
        action: 'voice_pack_disabled',
        status: 'succeeded',
        source: 'admin.voice_packs',
        metadata: {
          voice_pack_id: disabled.id,
          provider: disabled.provider,
          model: disabled.model,
          tts_model_id: disabled.ttsModelId,
        },
      })
      return c.json(disabled)
    })
}
