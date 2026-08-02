import type { ConfigKVService } from '../../../services/adapters/config-kv'
import type { ProviderCatalogService } from '../../../services/domain/provider-catalog'
import type { HonoEnv } from '../../../types/hono'

import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import { createAdminCapabilityAliasRoutes } from '.'
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
          llm: {
            models: {
              'chat-default': { upstreams: [] },
              'chat-fallback': { upstreams: [] },
            },
          },
          tts: { models: {} },
          asr: { models: { 'aliyun/asr-primary': { provider: 'aliyun-nls', upstreams: [] } } },
        }
      }
      throw new ApiError(503, 'CONFIG_NOT_SET', 'Service configuration is incomplete')
    }),
    getOptional: vi.fn(async () => null),
    get: vi.fn(),
    set: vi.fn(),
  } as unknown as ConfigKVService
}

function createService(): ProviderCatalogService {
  return {
    syncAliasesFromRouterConfig: vi.fn(async () => []),
    listAliases: vi.fn(async () => []),
    resolveEnabledAlias: vi.fn(),
    updateAlias: vi.fn(async (_id, input) => ({ id: 'alias-1', ...input })),
    updateAliasRoute: vi.fn(async (_id, input) => ({ id: 'route-1', ...input })),
  } as unknown as ProviderCatalogService
}

function createTestApp(input: {
  user: MockUser | null
  configKV?: ConfigKVService
  service?: ProviderCatalogService
}) {
  return new Hono<HonoEnv>()
    .use('*', async (c, next) => {
      c.set('user', input.user as HonoEnv['Variables']['user'])
      await next()
    })
    .route('/api/admin/capability-aliases', createAdminCapabilityAliasRoutes({
      configKV: input.configKV ?? createConfigKV(),
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

describe('admin capability alias routes', () => {
  it('returns 401 when unauthenticated', async () => {
    const service = createService()
    const app = createTestApp({ user: null, service })
    const res = await jsonRequest(app, 'GET', '/api/admin/capability-aliases')

    expect(res.status).toBe(401)
    expect(service.listAliases).not.toHaveBeenCalled()
  })

  it('syncs LLM aliases from router config with the default model first', async () => {
    const service = createService()
    const app = createTestApp({ user: ADMIN, service })

    const res = await jsonRequest(app, 'POST', '/api/admin/capability-aliases/sync', {
      surface: 'llm',
    })

    expect(res.status).toBe(200)
    expect(service.syncAliasesFromRouterConfig).toHaveBeenCalledWith({
      surface: 'llm',
      modelIds: ['chat-default', 'chat-fallback'],
    })
  })

  it('syncs ASR aliases from router config', async () => {
    const service = createService()
    const app = createTestApp({ user: ADMIN, service })

    const res = await jsonRequest(app, 'POST', '/api/admin/capability-aliases/sync', {
      surface: 'asr',
    })

    expect(res.status).toBe(200)
    expect(service.syncAliasesFromRouterConfig).toHaveBeenCalledWith({
      surface: 'asr',
      modelIds: ['aliyun/asr-primary'],
    })
  })

  it('maps missing aliases to 404 on update', async () => {
    const service = createService()
    vi.mocked(service.updateAlias).mockResolvedValueOnce(null)
    const app = createTestApp({ user: ADMIN, service })

    const res = await jsonRequest(app, 'PATCH', '/api/admin/capability-aliases/missing', {
      enabled: false,
    })

    expect(res.status).toBe(404)
  })

  it('updates alias routes separately from aliases', async () => {
    const service = createService()
    const app = createTestApp({ user: ADMIN, service })

    const res = await jsonRequest(app, 'PATCH', '/api/admin/capability-aliases/routes/route-1', {
      pool: 'fallback',
    })

    expect(res.status).toBe(200)
    expect(service.updateAliasRoute).toHaveBeenCalledWith('route-1', { pool: 'fallback' })
  })
})
