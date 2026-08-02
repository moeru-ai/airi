import type { ConfigKVService } from '../../../services/adapters/config-kv'
import type { LlmRouterService } from '../../../services/domain/llm-router'
import type { ProviderCatalogService } from '../../../services/domain/provider-catalog'
import type { HonoEnv } from '../../../types/hono'

import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import { createAdminProviderCatalogRoutes } from '.'
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
    routeTts: vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-type': 'audio/mpeg' },
    })),
    listTtsVoices: vi.fn(async () => [
      { id: 'en-US-AvaMultilingualNeural', name: 'Ava', previewUrl: 'https://example.com/ava.mp3' },
    ]),
    invalidateConfig: vi.fn(),
    invalidateTtsVoicesCache: vi.fn(),
  } as unknown as LlmRouterService
}

function createService(): ProviderCatalogService {
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
    syncTtsVoices: vi.fn(async (input: Parameters<ProviderCatalogService['syncTtsVoices']>[0]) => input.voices.map((voice, index) => ({
      id: `voice-${index}`,
      providerVoiceId: voice.id,
      displayName: voice.name ?? voice.id,
      enabled: false,
    }))),
    listTtsVoices: vi.fn(async () => []),
    listEnabledTtsVoices: vi.fn(async () => []),
    getTtsVoiceWithModel: vi.fn(async () => ({
      model: {
        id: 'model-1',
        routerModelId: 'microsoft/v1',
        provider: 'azure',
        displayName: 'Azure',
        enabled: false,
        displayOrder: 0,
        lastSyncedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      voice: {
        id: 'voice-1',
        ttsModelId: 'model-1',
        providerVoiceId: 'en-US-AvaMultilingualNeural',
        displayName: 'Ava',
        enabled: false,
        displayOrder: 0,
        languages: [],
        labels: {},
        previewAudioUrl: null,
        source: 'provider-sync',
        lastSyncedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    })),
    updateTtsVoice: vi.fn(async (_id, input) => ({ id: 'voice-1', ...input })),
    assertTtsVoiceEnabled: vi.fn(),
  } as unknown as ProviderCatalogService
}

function createTestApp(input: {
  user: MockUser | null
  configKV?: ConfigKVService
  llmRouter?: LlmRouterService
  service?: ProviderCatalogService
}) {
  return new Hono<HonoEnv>()
    .use('*', async (c, next) => {
      c.set('user', input.user as HonoEnv['Variables']['user'])
      await next()
    })
    .route('/api/admin/provider-catalog', createAdminProviderCatalogRoutes({
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

describe('admin provider catalog routes', () => {
  it('returns 401 when unauthenticated', async () => {
    const service = createService()
    const app = createTestApp({ user: null, service })
    const res = await jsonRequest(app, 'GET', '/api/admin/provider-catalog/tts/models')

    expect(res.status).toBe(401)
    expect(service.listTtsModels).not.toHaveBeenCalled()
  })

  it('syncs TTS voices from the provider into the provider catalog', async () => {
    const service = createService()
    const llmRouter = createLlmRouter()
    const app = createTestApp({ user: ADMIN, service, llmRouter })

    const res = await jsonRequest(app, 'POST', '/api/admin/provider-catalog/tts/voices/sync', {
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

    const res = await jsonRequest(app, 'PATCH', '/api/admin/provider-catalog/tts/models/missing', {
      enabled: false,
    })

    expect(res.status).toBe(404)
  })

  it('generates and stores a TTS voice preview data URL', async () => {
    const service = createService()
    const llmRouter = createLlmRouter()
    const app = createTestApp({ user: ADMIN, service, llmRouter })

    const res = await jsonRequest(app, 'POST', '/api/admin/provider-catalog/tts/voices/voice-1/preview', {
      text: 'Preview this voice.',
    })

    expect(res.status).toBe(200)
    expect(llmRouter.routeTts).toHaveBeenCalledWith({
      modelName: 'microsoft/v1',
      input: {
        text: 'Preview this voice.',
        voice: 'en-US-AvaMultilingualNeural',
        responseFormat: undefined,
      },
    })
    expect(service.updateTtsVoice).toHaveBeenCalledWith('voice-1', {
      previewAudioUrl: 'data:audio/mpeg;base64,AQID',
    })
    expect(await res.json()).toMatchObject({
      contentType: 'audio/mpeg',
      byteLength: 3,
      voice: {
        id: 'voice-1',
        previewAudioUrl: 'data:audio/mpeg;base64,AQID',
      },
    })
  })
})
