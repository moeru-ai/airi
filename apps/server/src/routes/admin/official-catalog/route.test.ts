import type { ConfigKVService } from '../../../services/adapters/config-kv'
import type { LlmRouterService } from '../../../services/domain/llm-router'
import type { OfficialCatalogService } from '../../../services/domain/official-catalog'
import type { HonoEnv } from '../../../types/hono'

import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import { createAdminOfficialCatalogRoutes } from '.'
import { ApiError } from '../../../utils/error'

interface MockUser {
  id: string
  email: string
  role?: string | null
}

const ADMIN: MockUser = { id: 'admin-1', email: 'admin@example.com', role: 'admin' }

function createConfigKV(): ConfigKVService {
  return {
    getOrThrow: vi.fn(async (key: string) => {
      if (key === 'DEFAULT_CHAT_MODEL')
        return 'chat-default'
      if (key === 'LLM_ROUTER_CONFIG') {
        return {
          llm: { models: { 'chat-default': { upstreams: [] } } },
          tts: { models: { 'microsoft/v1': { provider: 'azure', upstreams: [] } } },
          asr: { models: { auto: { provider: 'aliyun-nls', upstreams: [] } } },
        }
      }
      throw new ApiError(503, 'CONFIG_NOT_SET', 'Service configuration is incomplete')
    }),
    getOptional: vi.fn(async () => null),
    get: vi.fn(),
    set: vi.fn(),
  } as unknown as ConfigKVService
}

function createLlmRouter(): LlmRouterService {
  return {
    route: vi.fn(),
    routeTts: vi.fn(),
    listTtsVoices: vi.fn(async () => [
      { id: 'en-US-AvaMultilingualNeural', name: 'Ava', previewUrl: 'https://example.com/ava.mp3' },
    ]),
    invalidateConfig: vi.fn(),
    invalidateTtsVoicesCache: vi.fn(),
  } as unknown as LlmRouterService
}

function createService(): OfficialCatalogService {
  return {
    syncAliasesFromRouterConfig: vi.fn(async () => []),
    listAliases: vi.fn(async () => []),
    resolveEnabledAlias: vi.fn(),
    updateAlias: vi.fn(async (_id, input) => ({ id: 'alias-1', ...input })),
    updateAliasRoute: vi.fn(async (_id, input) => ({ id: 'route-1', ...input })),
    syncTtsModelsFromRouterConfig: vi.fn(async () => []),
    listTtsModels: vi.fn(async () => []),
    listEnabledTtsModels: vi.fn(async () => []),
    updateTtsModel: vi.fn(async (_id, input) => ({ id: 'model-1', ...input })),
    assertTtsModelEnabled: vi.fn(),
    syncTtsVoices: vi.fn(async (input: Parameters<OfficialCatalogService['syncTtsVoices']>[0]) => input.voices.map((voice, index) => ({
      id: `voice-${index}`,
      providerVoiceId: voice.id,
      displayName: voice.name ?? voice.id,
      enabled: false,
    }))),
    listTtsVoices: vi.fn(async () => []),
    listEnabledTtsVoices: vi.fn(async () => []),
    updateTtsVoice: vi.fn(async (_id, input) => ({ id: 'voice-1', ...input })),
    assertTtsVoiceEnabled: vi.fn(),
  } as unknown as OfficialCatalogService
}

function createTestApp(input: {
  user: MockUser | null
  configKV?: ConfigKVService
  llmRouter?: LlmRouterService
  service?: OfficialCatalogService
}) {
  return new Hono<HonoEnv>()
    .use('*', async (c, next) => {
      c.set('user', input.user as HonoEnv['Variables']['user'])
      await next()
    })
    .route('/api/admin/official-catalog', createAdminOfficialCatalogRoutes({
      configKV: input.configKV ?? createConfigKV(),
      llmRouter: input.llmRouter ?? createLlmRouter(),
      service: input.service ?? createService(),
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

describe('admin official catalog routes', () => {
  it('returns 401 when unauthenticated', async () => {
    const service = createService()
    const app = createTestApp({ user: null, service })
    const res = await jsonRequest(app, 'GET', '/api/admin/official-catalog/aliases')

    expect(res.status).toBe(401)
    expect(service.listAliases).not.toHaveBeenCalled()
  })

  it('syncs TTS voices from the provider into the official catalog', async () => {
    const service = createService()
    const llmRouter = createLlmRouter()
    const app = createTestApp({ user: ADMIN, service, llmRouter })

    const res = await jsonRequest(app, 'POST', '/api/admin/official-catalog/tts/voices/sync', {
      routerModelId: 'microsoft/v1',
    })

    expect(res.status).toBe(200)
    expect(service.syncTtsModelsFromRouterConfig).toHaveBeenCalledWith({
      models: { 'microsoft/v1': { provider: 'azure' } },
    })
    expect(llmRouter.listTtsVoices).toHaveBeenCalledWith('microsoft/v1')
    expect(service.syncTtsVoices).toHaveBeenCalledWith({
      routerModelId: 'microsoft/v1',
      voices: [{
        id: 'en-US-AvaMultilingualNeural',
        name: 'Ava',
        languages: undefined,
        labels: undefined,
        previewAudioUrl: 'https://example.com/ava.mp3',
      }],
    })
    expect(await res.json()).toMatchObject({ syncedCount: 1 })
  })

  it('maps missing catalog rows to 404 on update', async () => {
    const service = createService()
    vi.mocked(service.updateTtsModel).mockResolvedValueOnce(null)
    const app = createTestApp({ user: ADMIN, service })

    const res = await jsonRequest(app, 'PATCH', '/api/admin/official-catalog/tts/models/missing', {
      enabled: false,
    })

    expect(res.status).toBe(404)
  })
})
