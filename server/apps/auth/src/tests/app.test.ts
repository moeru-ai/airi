import { describe, expect, it, vi } from 'vitest'

import { buildAuthApp } from '../server'

function createTestDeps() {
  return {
    auth: {
      api: {
        getOAuthServerConfig: vi.fn(async () => ({ issuer: 'https://api.airi.build/api/auth' })),
        getOpenIdConfig: vi.fn(async () => ({ issuer: 'https://api.airi.build/api/auth' })),
        getSession: vi.fn(async () => null),
      },
      handler: vi.fn(async () => new Response('auth-handler')),
    } as any,
    db: {
      execute: vi.fn(async () => []),
    } as any,
    env: {
      ADDITIONAL_TRUSTED_ORIGINS: [],
      AUTH_UI_URL: 'https://accounts.airi.build/ui',
      PUBLIC_URL: 'https://api.airi.build',
    } as any,
    rateLimitMetrics: null,
    redis: {
      ping: vi.fn(async () => 'PONG'),
    } as any,
  }
}

describe('standalone auth app', () => {
  it('does not expose Better Auth management routes', async () => {
    const deps = createTestDeps()
    const { app } = await buildAuthApp(deps)

    expect((await app.request('/api/auth/admin')).status).toBe(404)
    expect((await app.request('/api/auth/admin/list-users')).status).toBe(404)
    expect((await app.request('/api/auth/admin/ban-user', { method: 'POST' })).status).toBe(404)
    expect((await app.request('/api/auth/admin/future-endpoint', { method: 'DELETE' })).status).toBe(404)
    expect(deps.auth.handler).not.toHaveBeenCalled()
  })

  it('identifies its public issuer at the root', async () => {
    const { app } = await buildAuthApp(createTestDeps())
    const response = await app.request('/')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      accounts: 'https://accounts.airi.build/ui',
      issuer: 'https://api.airi.build/api/auth',
      service: 'airi-auth',
    })
  })

  it('serves auth without exposing business API routes', async () => {
    const deps = createTestDeps()
    const { app } = await buildAuthApp(deps)

    expect((await app.request('/api/auth/custom-route')).status).toBe(200)
    expect((await app.request('/api/v1/characters')).status).toBe(404)
    expect(deps.auth.handler).toHaveBeenCalledTimes(1)
  })

  it('checks only the infrastructure needed by the auth surface', async () => {
    const deps = createTestDeps()
    const { app } = await buildAuthApp(deps)
    const response = await app.request('/readyz')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      checks: { db: 'ok', redis: 'ok' },
      status: 'ready',
    })
    expect(deps.db.execute).toHaveBeenCalledWith('SELECT 1 FROM "user" LIMIT 1')
    expect(deps.redis.ping).toHaveBeenCalledTimes(1)
  })
})
