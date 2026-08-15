import type { AuthConfigService } from '../rate-limit'
import type { AuthRoutesDeps, HonoEnv } from '../routes'

import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../error'
import { createAuthRoutes } from '../routes'

// The /oauth2/userinfo guard composes resolveSessionIgnoringBan (cookie path
// mocked via auth.api.getSession) with isUserBannedNow(user.banned). The ban
// flag lives on the user row (better-auth admin plugin), so we drive it via the
// mocked session — no DB query happens on this path.

function createAuthConfig(): AuthConfigService {
  return {
    getRateLimit: vi.fn(async () => ({ max: 100, windowSec: 60 })),
    onRateLimitChange: vi.fn(() => () => true),
    onStop: vi.fn(() => () => true),
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
  }
}

interface SessionUser { id: string, email: string, banned: boolean, banExpires: Date | null }

function sessionFor(user: SessionUser) {
  return {
    user: { ...user, name: 'U', emailVerified: true, image: null, createdAt: new Date(), updatedAt: new Date() },
    session: { id: 's1', userId: user.id, token: 't', createdAt: new Date(), updatedAt: new Date(), expiresAt: new Date(Date.now() + 60_000), ipAddress: null, userAgent: null },
  }
}

async function buildRoutes(currentUser: SessionUser) {
  const handler = vi.fn(async () => new Response(JSON.stringify({ sub: currentUser.id }), { status: 200, headers: { 'content-type': 'application/json' } }))

  const deps: AuthRoutesDeps = {
    auth: {
      handler,
      api: { getSession: vi.fn(async () => sessionFor(currentUser)) },
    } as any,
    db: {} as any, // userinfo path never queries the DB
    env: {
      PUBLIC_URL: 'http://localhost:3000',
      AUTH_UI_URL: 'https://accounts.airi.build/ui',
      ADDITIONAL_TRUSTED_ORIGINS: [],
    } as any,
    authConfig: createAuthConfig(),
    rateLimitMetrics: null,
  }

  const routes = await createAuthRoutes(deps)
  const app = new Hono<HonoEnv>()
    .route('/', routes)
    .onError((err, c) => {
      if (err instanceof ApiError)
        return c.json({ error: err.errorCode }, err.statusCode)
      return c.json({ error: 'internal', message: (err as Error).message }, 500)
    })

  return { routes: app, handler }
}

describe('oidc /oauth2/userinfo ban guard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 403 for a banned subject before reaching the better-auth handler', async () => {
    const { routes, handler } = await buildRoutes({ id: 'uid_ban', email: 'banme@example.com', banned: true, banExpires: null })

    const res = await routes.request('/api/auth/oauth2/userinfo', { headers: { Authorization: 'Bearer banned-jwt' } })

    expect(res.status).toBe(403)
    expect(handler).not.toHaveBeenCalled()
  })

  it('passes a non-banned subject through to the better-auth handler', async () => {
    const { routes, handler } = await buildRoutes({ id: 'uid_ok', email: 'ok@example.com', banned: false, banExpires: null })

    const res = await routes.request('/api/auth/oauth2/userinfo', { headers: { Authorization: 'Bearer ok-jwt' } })

    expect(res.status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(await res.json()).toMatchObject({ sub: 'uid_ok' })
  })

  it('passes a subject whose ban has expired', async () => {
    const { routes, handler } = await buildRoutes({ id: 'uid_exp', email: 'exp@example.com', banned: true, banExpires: new Date(Date.now() - 1000) })

    const res = await routes.request('/api/auth/oauth2/userinfo', { headers: { Authorization: 'Bearer exp-jwt' } })

    expect(res.status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(1)
  })
})

describe('auth UI routes', () => {
  it('keeps the Google provider hint on the OIDC sign-in redirect', async () => {
    const { routes, handler } = await buildRoutes({ id: 'uid_ok', email: 'ok@example.com', banned: false, banExpires: null })
    handler.mockResolvedValueOnce(new Response(null, {
      status: 302,
      headers: { location: '/auth/sign-in?client_id=airi-stage-pocket&response_type=code' },
    }))

    const res = await routes.request('/api/auth/oauth2/authorize?client_id=airi-stage-pocket&response_type=code&provider=google')

    // ROOT CAUSE:
    //
    // The OIDC plugin signs only its known query fields before it redirects.
    // It removed the mobile provider hint, so Google opened the generic sign-in page.
    //
    // Before: /auth/sign-in?client_id=airi-stage-pocket&response_type=code
    // After:  /auth/sign-in?client_id=airi-stage-pocket&response_type=code&provider=google
    expect(res.headers.get('location')).toBe('/auth/sign-in?client_id=airi-stage-pocket&response_type=code&provider=google')
  })

  it('keeps the GitHub provider hint on the OIDC sign-in redirect', async () => {
    const { routes, handler } = await buildRoutes({ id: 'uid_ok', email: 'ok@example.com', banned: false, banExpires: null })
    handler.mockResolvedValueOnce(new Response(null, {
      status: 302,
      headers: { location: '/auth/sign-in?client_id=airi-stage-pocket&response_type=code' },
    }))

    const res = await routes.request('/api/auth/oauth2/authorize?client_id=airi-stage-pocket&response_type=code&provider=github')

    expect(res.headers.get('location')).toBe('/auth/sign-in?client_id=airi-stage-pocket&response_type=code&provider=github')
  })

  it('keeps the Steam provider hint on the OIDC sign-in redirect', async () => {
    const { routes, handler } = await buildRoutes({ id: 'uid_ok', email: 'ok@example.com', banned: false, banExpires: null })
    handler.mockResolvedValueOnce(new Response(null, {
      status: 302,
      headers: { location: '/auth/sign-in?client_id=airi-stage-pocket&response_type=code' },
    }))

    const res = await routes.request('/api/auth/oauth2/authorize?client_id=airi-stage-pocket&response_type=code&provider=steam')

    expect(res.headers.get('location')).toBe('/auth/sign-in?client_id=airi-stage-pocket&response_type=code&provider=steam')
  })

  it('does not forward an unknown provider to the auth UI', async () => {
    const { routes, handler } = await buildRoutes({ id: 'uid_ok', email: 'ok@example.com', banned: false, banExpires: null })
    handler.mockResolvedValueOnce(new Response(null, {
      status: 302,
      headers: { location: '/auth/sign-in?client_id=airi-stage-pocket&response_type=code' },
    }))

    const res = await routes.request('/api/auth/oauth2/authorize?client_id=airi-stage-pocket&response_type=code&provider=unknown')

    expect(res.headers.get('location')).toBe('/auth/sign-in?client_id=airi-stage-pocket&response_type=code')
  })

  it('keeps the generic sign-in redirect when the request has no provider', async () => {
    const { routes, handler } = await buildRoutes({ id: 'uid_ok', email: 'ok@example.com', banned: false, banExpires: null })
    handler.mockResolvedValueOnce(new Response(null, {
      status: 302,
      headers: { location: '/auth/sign-in?client_id=airi-stage-pocket&response_type=code' },
    }))

    const res = await routes.request('/api/auth/oauth2/authorize?client_id=airi-stage-pocket&response_type=code')

    expect(res.headers.get('location')).toBe('/auth/sign-in?client_id=airi-stage-pocket&response_type=code')
  })

  it('redirects sign-in provider shortcut to the standalone auth UI', async () => {
    const { routes } = await buildRoutes({ id: 'uid_ok', email: 'ok@example.com', banned: false, banExpires: null })

    const res = await routes.request('/auth/sign-in?provider=github&client_id=stage-web&prompt=login&redirect_uri=http%3A%2F%2Flocalhost%3A5173%2Fauth%2Fcallback')

    expect(res.status).toBe(302)

    const location = res.headers.get('location')
    expect(location).toBe('https://accounts.airi.build/ui/sign-in?provider=github&client_id=stage-web&prompt=login&redirect_uri=http%3A%2F%2Flocalhost%3A5173%2Fauth%2Fcallback&api_server_url=http%3A%2F%2Flocalhost%3A3000')
  })

  it('redirects Electron OIDC callback queries to the standalone auth UI relay', async () => {
    const { routes } = await buildRoutes({ id: 'uid_ok', email: 'ok@example.com', banned: false, banExpires: null })

    const res = await routes.request('/api/auth/oidc/electron-callback?code=sample-code&state=43123%3Aopaque-state')

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://accounts.airi.build/ui/api/auth/oidc/electron-callback?code=sample-code&state=43123%3Aopaque-state')
  })
})
