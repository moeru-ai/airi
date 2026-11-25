import { describe, expect, it, vi } from 'vitest'

import { buildAuthApp } from '../server'

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
      PUBLIC_URL: 'https://api.airi.build',
      AUTH_UI_URL: 'https://accounts.airi.build/ui',
      ADDITIONAL_TRUSTED_ORIGINS: [],
    } as any,
    rateLimitMetrics: null,
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
      service: 'airi-auth',
      issuer: 'https://api.airi.build/api/auth',
      accounts: 'https://accounts.airi.build/ui',
    })
  })

  it('serves auth without exposing business API routes', async () => {
    const deps = createTestDeps()
    const { app } = await buildAuthApp(deps)

    expect((await app.request('/api/auth/custom-route')).status).toBe(200)
    expect((await app.request('/api/v1/characters')).status).toBe(404)
    expect(deps.auth.handler).toHaveBeenCalledTimes(1)
  })

  it('gives credentials only to a preflight from the Auth UI origin', async () => {
    const { app } = await buildAuthApp(createTestDeps())
    const preflight = (origin: string) => app.request('/api/auth/get-session', {
      method: 'OPTIONS',
      headers: {
        'Origin': origin,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'content-type',
      },
    })

    const ui = await preflight('https://accounts.airi.build')
    expect(ui.status).toBe(204)
    expect(ui.headers.get('access-control-allow-origin')).toBe('https://accounts.airi.build')
    expect(ui.headers.get('access-control-allow-credentials')).toBe('true')
    expect(ui.headers.get('access-control-allow-headers')).toBe('content-type')
    expect(ui.headers.get('vary')).toBe('Origin, Access-Control-Request-Headers')

    const other = await preflight('https://airi.moeru.ai')
    expect(other.status).toBe(204)
    expect(other.headers.get('access-control-allow-origin')).toBe('*')
    expect(other.headers.get('access-control-allow-credentials')).toBeNull()
  })

  it('gives the Auth UI origin credentials on a Better Auth response', async () => {
    const { app } = await buildAuthApp(createTestDeps())
    const response = await app.request('/api/auth/get-session', { headers: { Origin: 'https://accounts.airi.build' } })

    expect(response.headers.get('access-control-allow-origin')).toBe('https://accounts.airi.build')
    expect(response.headers.get('access-control-allow-credentials')).toBe('true')
    expect(response.headers.get('vary')).toBe('Origin')
  })

  it('checks only the infrastructure needed by the auth surface', async () => {
    const deps = createTestDeps()
    const { app } = await buildAuthApp(deps)
    const response = await app.request('/readyz')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: 'ready',
      checks: { db: 'ok', redis: 'ok' },
    })
    expect(deps.db.execute).toHaveBeenCalledWith('SELECT 1 FROM "user" LIMIT 1')
    expect(deps.redis.ping).toHaveBeenCalledTimes(1)
  })
})
