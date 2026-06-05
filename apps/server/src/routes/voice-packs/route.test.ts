import type { VoicePackService } from '../../services/domain/voice-packs'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import { createVoicePackRoutes } from '.'
import { ApiError } from '../../utils/error'

function createTestApp(service: VoicePackService, user: { id: string } | null) {
  return new Hono<HonoEnv>()
    .use('*', async (c, next) => {
      c.set('user', user as HonoEnv['Variables']['user'])
      await next()
    })
    .route('/api/v1/voice-packs', createVoicePackRoutes(service))
    .onError((err, c) => {
      if (err instanceof ApiError)
        return c.json({ error: err.errorCode }, err.statusCode)
      return c.json({ error: 'internal', message: (err as Error).message }, 500)
    })
}

function createService() {
  return {
    listEnabled: vi.fn(async () => [{ id: 'vp-1', name: 'Enabled', enabled: true }]),
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    disable: vi.fn(),
    findById: vi.fn(),
  } as unknown as VoicePackService
}

describe('voice packs routes', () => {
  it('requires auth before listing enabled packs', async () => {
    // @example anonymous users cannot enumerate curated packs.
    const service = createService()
    const app = createTestApp(service, null)
    const res = await app.request('/api/v1/voice-packs')

    expect(res.status).toBe(401)
    expect(service.listEnabled).not.toHaveBeenCalled()
  })

  it('lists only enabled packs through the service', async () => {
    // @example client binding surface delegates to enabled-only service method.
    const service = createService()
    const app = createTestApp(service, { id: 'u-1' })
    const res = await app.request('/api/v1/voice-packs')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([{ id: 'vp-1', name: 'Enabled', enabled: true }])
    expect(service.listEnabled).toHaveBeenCalled()
  })
})
