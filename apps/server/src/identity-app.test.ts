import { describe, expect, it, vi } from 'vitest'

import { buildIdentityApp } from './identity-app'

function createTestDeps() {
  return {
    auth: {
      api: {
        getSession: vi.fn(async () => null),
        getOAuthServerConfig: vi.fn(async () => ({ issuer: 'https://api.airi.build/api/auth' })),
        getOpenIdConfig: vi.fn(async () => ({ issuer: 'https://api.airi.build/api/auth' })),
      },
      handler: vi.fn(async () => new Response('auth-handler')),
    } as any,
    db: {
      execute: vi.fn(async () => []),
    } as any,
    redis: {
      ping: vi.fn(async () => 'PONG'),
    } as any,
    env: {
      API_SERVER_URL: 'https://api.airi.build',
      AUTH_UI_URL: 'https://accounts.airi.build/ui',
      ADDITIONAL_TRUSTED_ORIGINS: [],
    } as any,
    configKV: {
      getOrThrow: vi.fn(async (key: string) => key === 'AUTH_RATE_LIMIT_MAX' ? 20 : 60),
    } as any,
    rateLimitMetrics: null,
  }
}

describe('standalone identity app', () => {
  it('identifies its public issuer at the root', async () => {
    const { app } = await buildIdentityApp(createTestDeps())
    const response = await app.request('/')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      service: 'airi-identity',
      issuer: 'https://api.airi.build/api/auth',
      accounts: 'https://accounts.airi.build/ui',
    })
  })

  it('serves auth without exposing business API routes', async () => {
    const deps = createTestDeps()
    const { app } = await buildIdentityApp(deps)

    expect((await app.request('/api/auth/custom-route')).status).toBe(200)
    expect((await app.request('/api/v1/characters')).status).toBe(404)
    expect(deps.auth.handler).toHaveBeenCalledTimes(1)
  })

  it('checks only the infrastructure needed by the identity surface', async () => {
    const deps = createTestDeps()
    const { app } = await buildIdentityApp(deps)
    const response = await app.request('/readyz')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: 'ready',
      checks: { db: 'ok', redis: 'ok' },
    })
    expect(deps.db.execute).toHaveBeenCalledWith('SELECT 1')
    expect(deps.redis.ping).toHaveBeenCalledTimes(1)
  })
})
