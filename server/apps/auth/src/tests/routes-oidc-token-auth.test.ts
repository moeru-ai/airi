import type { AuthRoutesDeps, HonoEnv } from '../routes'

import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createAuthRoutes } from '../routes'

const { jwtVerify } = vi.hoisted(() => ({
  jwtVerify: vi.fn(),
}))

vi.mock('jose', async (importOriginal) => {
  const original = await importOriginal<typeof import('jose')>()
  return {
    ...original,
    createLocalJWKSet: vi.fn(() => 'test-jwks'),
    jwtVerify,
  }
})

const testUser = {
  id: 'user-1',
  name: 'AIRI User',
  email: 'user@example.com',
  emailVerified: true,
  image: null,
  banned: false,
  banReason: null,
  banExpires: null,
  lastSeenAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
}

async function buildRoutes() {
  const getSession = vi.fn(async () => null)
  const getJwks = vi.fn(async () => ({ keys: [{ kty: 'RSA', kid: 'key-1' }] }))
  const findFirst = vi.fn(async () => testUser)
  const deps: AuthRoutesDeps = {
    auth: {
      handler: vi.fn(async () => new Response('auth-handler')),
      api: {
        getSession,
        getJwks,
        getOAuthServerConfig: vi.fn(),
        getOpenIdConfig: vi.fn(),
      },
    } as never,
    db: {
      query: { user: { findFirst } },
    } as never,
    env: {
      PUBLIC_URL: 'https://api.airi.test',
      AUTH_UI_URL: 'https://accounts.airi.test/ui',
      ADDITIONAL_TRUSTED_ORIGINS: [],
    } as never,
    rateLimitMetrics: null,
  }

  const routes = await createAuthRoutes(deps)
  const app = new Hono<HonoEnv>().route('/', routes)
  return { app, findFirst, getJwks, getSession }
}

describe('oidc token auth routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    jwtVerify.mockResolvedValue({
      payload: {
        sub: testUser.id,
        jti: 'access-token-1',
        iat: 1_767_225_600,
        exp: 1_767_229_200,
      },
    })
  })

  it.each([
    ['GET', '/api/auth/get-session'],
    ['GET', '/api/auth/list-sessions'],
  ])('resolves a JWT on %s %s without asking Better Auth for a session', async (method, path) => {
    const { app, findFirst, getJwks, getSession } = await buildRoutes()

    // ROOT CAUSE:
    //
    // These routes used to ask Better Auth for a session before validating the
    // access token. The OIDC bridge converted that lookup into a new database
    // session, so every poll inserted another row.
    //
    // We now validate the JWT first and only use Better Auth as the fallback.
    const response = await app.request(path, {
      method,
      headers: { Authorization: 'Bearer signed.jwt.token' },
    })

    expect(response.status).toBe(200)
    expect(jwtVerify).toHaveBeenCalledTimes(1)
    expect(getJwks).toHaveBeenCalledTimes(1)
    expect(findFirst).toHaveBeenCalledTimes(1)
    expect(getSession).not.toHaveBeenCalled()
  })

  it('falls back to Better Auth when JWT verification fails', async () => {
    jwtVerify.mockRejectedValueOnce(new Error('invalid token'))
    const { app, getSession } = await buildRoutes()

    const response = await app.request('/api/auth/get-session', {
      headers: { Authorization: 'Bearer not.a.valid-token' },
    })

    expect(response.status).toBe(200)
    expect(getSession).toHaveBeenCalledTimes(1)
    expect(await response.json()).toBeNull()
  })

  it('accepts a case-insensitive bearer scheme without asking Better Auth for a session', async () => {
    const { app, getSession } = await buildRoutes()

    const response = await app.request('/api/auth/get-session', {
      headers: { Authorization: 'bEaReR signed.jwt.token' },
    })

    expect(response.status).toBe(200)
    expect(getSession).not.toHaveBeenCalled()
  })

  it('surfaces a JWKS loader failure instead of treating it as an invalid token', async () => {
    const { app, getJwks, getSession } = await buildRoutes()
    getJwks.mockRejectedValueOnce(new Error('database unavailable'))

    const response = await app.request('/api/auth/get-session', {
      headers: { Authorization: 'Bearer signed.jwt.token' },
    })

    expect(response.status).toBe(500)
    expect(getSession).not.toHaveBeenCalled()
  })

  it('falls back to Better Auth when verified claims do not match the access-token contract', async () => {
    jwtVerify.mockResolvedValueOnce({
      payload: {
        sub: testUser.id,
        exp: 1_767_229_200,
      },
    })
    const { app, findFirst, getSession } = await buildRoutes()

    const response = await app.request('/api/auth/get-session', {
      headers: { Authorization: 'Bearer signed.jwt.token' },
    })

    expect(response.status).toBe(200)
    expect(findFirst).not.toHaveBeenCalled()
    expect(getSession).toHaveBeenCalledTimes(1)
  })
})
