import type { VoicePackService } from '../../services/domain/voice-packs'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'

import { authGuard } from '../../middlewares/auth'

function publicVoicePack(pack: Awaited<ReturnType<VoicePackService['listEnabled']>>[number]) {
  return {
    id: pack.id,
    name: pack.name,
    description: pack.description,
    voiceId: pack.voiceId,
    params: pack.params,
    enabled: pack.enabled,
    createdAt: pack.createdAt,
    updatedAt: pack.updatedAt,
  }
}

/**
 * User-facing Voice Pack routes.
 *
 * Mounted at `/api/v1/voice-packs`. Only enabled packs are exposed so disabled
 * curated entries remain available to historical character snapshots but cannot
 * be newly selected.
 */
export function createVoicePackRoutes(service: VoicePackService) {
  return new Hono<HonoEnv>()
    .use('*', authGuard)
    .get('/', async (c) => {
      const packs = await service.listEnabled()
      // eslint-disable-next-line no-restricted-syntax -- Known deviation in 2026-10-19-http-response-conventions.md: clients read a bare array.
      return c.json(packs.map(publicVoicePack))
    })
}
