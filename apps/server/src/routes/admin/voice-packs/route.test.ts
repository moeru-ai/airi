import type { VoicePack } from '../../../schemas/voice-packs'
import type { ProductEventService } from '../../../services/domain/product-events'
import type { CreateVoicePackInput, UpdateVoicePackInput, VoicePackService } from '../../../services/domain/voice-packs'
import type { HonoEnv } from '../../../types/hono'

import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import { createAdminVoicePackRoutes } from '.'
import { ApiError } from '../../../utils/error'

interface MockUser {
  id: string
  email: string
  role?: string | null
}

const ADMIN: MockUser = { id: 'admin-1', email: 'admin@example.com', role: 'admin' }

function createService() {
  const makePack = (overrides: Partial<VoicePack> = {}): VoicePack => ({
    id: 'vp-1',
    name: 'Neuro Sama',
    description: null,
    provider: 'volcengine',
    model: 'seed-tts-2.0',
    voiceId: 'voice-neuro',
    upstreamVoiceId: 'voice-neuro-upstream',
    ttsModelId: 'volcengine/neuro-pool',
    params: {},
    costMultiplier: 1.5,
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  })

  return {
    list: vi.fn(async () => []),
    create: vi.fn(async (input: CreateVoicePackInput) => makePack(input)),
    update: vi.fn(async (_id: string, input: UpdateVoicePackInput): Promise<VoicePack | null> => makePack(input)),
    disable: vi.fn(async (id: string): Promise<VoicePack | null> => makePack({ id, enabled: false })),
    listEnabled: vi.fn(),
    findById: vi.fn(),
    findEnabledByVoiceId: vi.fn(),
  } satisfies VoicePackService
}

function createProductEventService(): ProductEventService {
  return {
    track: vi.fn(async () => undefined),
    countDistinctUsersByFeature: vi.fn(async () => []),
  }
}

function createTestApp(service: VoicePackService, user: MockUser | null, productEventService = createProductEventService()) {
  return new Hono<HonoEnv>()
    .use('*', async (c, next) => {
      c.set('user', user as HonoEnv['Variables']['user'])
      await next()
    })
    .route('/api/admin/voice-packs', createAdminVoicePackRoutes({
      productEventService,
      service,
    }))
    .onError((err, c) => {
      if (err instanceof ApiError)
        return c.json({ error: err.errorCode, details: err.details }, err.statusCode)
      return c.json({ error: 'internal', message: (err as Error).message }, 500)
    })
}

function jsonRequest(app: Hono<HonoEnv>, method: string, path: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body == null ? undefined : JSON.stringify(body),
  })
}

describe('admin voice packs — auth guards', () => {
  it('returns 401 when unauthenticated', async () => {
    // @example no session -> admin curation is not reachable.
    const service = createService()
    const app = createTestApp(service, null)
    const res = await jsonRequest(app, 'GET', '/api/admin/voice-packs')

    expect(res.status).toBe(401)
    expect(service.list).not.toHaveBeenCalled()
  })

  it('returns 403 for a non-admin user', async () => {
    // @example ordinary authenticated user -> forbidden.
    const service = createService()
    const app = createTestApp(service, { id: 'u', email: 'u@example.com', role: 'user' })
    const res = await jsonRequest(app, 'GET', '/api/admin/voice-packs')

    expect(res.status).toBe(403)
    expect(service.list).not.toHaveBeenCalled()
  })
})

describe('admin voice packs — CRUD', () => {
  it('lists all packs for admins', async () => {
    // @example admin list includes disabled rows; service owns filtering behavior.
    const service = createService()
    const app = createTestApp(service, ADMIN)
    const res = await jsonRequest(app, 'GET', '/api/admin/voice-packs')

    expect(res.status).toBe(200)
    expect(service.list).toHaveBeenCalled()
  })

  it('creates a pack with validated fields', async () => {
    // @example valid body -> route forwards canonical numeric params and enabled default.
    const service = createService()
    const productEventService = createProductEventService()
    const app = createTestApp(service, ADMIN, productEventService)
    const body = {
      name: 'Neuro Sama',
      provider: 'volcengine',
      model: 'seed-tts-2.0',
      voiceId: 'voice-neuro',
      upstreamVoiceId: 'voice-neuro-upstream',
      ttsModelId: 'volcengine/neuro-pool',
      params: { pitch: 20 },
      costMultiplier: 1.5,
    }
    const res = await jsonRequest(app, 'POST', '/api/admin/voice-packs', body)

    expect(res.status).toBe(201)
    expect(service.create).toHaveBeenCalledWith({ ...body, enabled: true })
    expect(productEventService.track).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'admin-1',
      feature: 'voice_pack',
      action: 'voice_pack_created',
      status: 'succeeded',
      source: 'admin.voice_packs',
      metadata: expect.objectContaining({
        voice_pack_id: 'vp-1',
        cost_multiplier: 1.5,
      }),
    }))
  })

  it('rejects invalid cost multiplier on create', async () => {
    // @example negative cost multiplier -> 400 before service call.
    const service = createService()
    const app = createTestApp(service, ADMIN)
    const res = await jsonRequest(app, 'POST', '/api/admin/voice-packs', {
      name: 'Bad',
      provider: 'volcengine',
      model: 'seed-tts-2.0',
      voiceId: 'voice-neuro',
      upstreamVoiceId: 'voice-neuro-upstream',
      ttsModelId: 'volcengine/neuro-pool',
      params: {},
      costMultiplier: -1,
    })

    expect(res.status).toBe(400)
    expect(service.create).not.toHaveBeenCalled()
  })

  it('updates a pack and maps missing ids to 404', async () => {
    // @example known id -> update; missing id -> not found.
    const service = createService()
    const app = createTestApp(service, ADMIN)
    const ok = await jsonRequest(app, 'PATCH', '/api/admin/voice-packs/vp-1', { name: 'Updated' })

    expect(ok.status).toBe(200)
    expect(service.update).toHaveBeenCalledWith('vp-1', { name: 'Updated' })

    service.update.mockResolvedValueOnce(null)
    const missing = await jsonRequest(app, 'PATCH', '/api/admin/voice-packs/missing', { name: 'Updated' })
    expect(missing.status).toBe(404)
  })

  it('soft-disables a pack', async () => {
    // @example disable endpoint does not delete; it returns the disabled row.
    const service = createService()
    const productEventService = createProductEventService()
    const app = createTestApp(service, ADMIN, productEventService)
    const res = await jsonRequest(app, 'POST', '/api/admin/voice-packs/vp-1/disable')

    expect(res.status).toBe(200)
    expect(service.disable).toHaveBeenCalledWith('vp-1')
    expect(productEventService.track).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'admin-1',
      feature: 'voice_pack',
      action: 'voice_pack_disabled',
      status: 'succeeded',
      source: 'admin.voice_packs',
      metadata: expect.objectContaining({
        voice_pack_id: 'vp-1',
      }),
    }))
    expect(await res.json()).toMatchObject({ id: 'vp-1', enabled: false })
  })
})
