import type { VoicePackService } from '../../services/domain/voice-packs'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import { createVoicePackRoutes } from '.'
import { ApiError } from '../../utils/error'

function createService() {
  return {
    create: vi.fn(),
    disable: vi.fn(),
    findById: vi.fn(),
    findEnabledByVoiceId: vi.fn(),
    list: vi.fn(),
    listEnabled: vi.fn(async () => [{
      costMultiplier: 2,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      description: 'Public description',
      enabled: true,
      id: 'vp-1',
      model: 'microsoft/v1',
      name: 'Enabled',
      params: { pitch: 10 },
      provider: 'azure',
      ttsModelId: 'microsoft/v1',
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      upstreamVoiceId: 'en-US-AvaMultilingualNeural',
      voiceId: 'friendly-voice',
    }]),
    update: vi.fn(),
  } as unknown as VoicePackService
}

function createTestApp(service: VoicePackService, user: null | { id: string }) {
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
    expect(await res.json()).toEqual([{
      costMultiplier: 2,
      createdAt: '2026-01-01T00:00:00.000Z',
      description: 'Public description',
      enabled: true,
      id: 'vp-1',
      name: 'Enabled',
      params: { pitch: 10 },
      updatedAt: '2026-01-02T00:00:00.000Z',
      voiceId: 'friendly-voice',
    }])
    expect(service.listEnabled).toHaveBeenCalled()
  })
})
