import type { AuthRoutesDeps } from '..'
import type { Database } from '../../../libs/db'
import type { ConfigKVService } from '../../../services/adapters/config-kv'

import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { createAuthRoutes } from '..'
import { mockDB } from '../../../libs/mock-db'
import { account, user, verification } from '../../../schemas/accounts'
import { createEnrollmentToken } from '../../../services/domain/steam-auth/enrollment-token'
import { ApiError } from '../../../utils/error'

import * as schema from '../../../schemas'

function createConfigKV(): ConfigKVService {
  const values: Record<string, number> = { AUTH_RATE_LIMIT_MAX: 100, AUTH_RATE_LIMIT_WINDOW_SEC: 60 }
  return {
    get: vi.fn(async (k: string) => values[k]),
    getOrThrow: vi.fn(async (k: string) => values[k]),
    getOptional: vi.fn(async (k: string) => values[k] ?? null),
    set: vi.fn(),
  } as any
}

async function buildRoutes(db: Database, { sessionUser }: { sessionUser: { id: string, banned: boolean } | null }) {
  if (sessionUser) {
    await db.insert(user).values({
      id: sessionUser.id,
      name: '',
      email: `${sessionUser.id}@example.com`,
      emailVerified: true,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  }

  const handler = vi.fn(async (_req: Request) =>
    new Response(null, { status: 302, headers: { location: `/api/auth/oidc/electron-callback?code=ac_1&state=43123:opaque` } }))

  const deps: AuthRoutesDeps = {
    auth: {
      handler,
      api: { getSession: vi.fn(async () => sessionUser
        ? {
            user: { id: sessionUser.id, name: 'U', email: 'u@x', emailVerified: true, image: null, createdAt: new Date(), updatedAt: new Date(), banned: sessionUser.banned, banExpires: null },
            session: { id: 's1', userId: sessionUser.id, token: 't', createdAt: new Date(), updatedAt: new Date(), expiresAt: new Date(Date.now() + 60_000), ipAddress: null, userAgent: null },
          }
        : null) },
    } as any,
    db,
    env: {
      API_SERVER_URL: 'http://localhost:3000',
      AUTH_UI_URL: 'https://accounts.airi.build/ui',
      ADDITIONAL_TRUSTED_ORIGINS: [],
    } as any,
    configKV: createConfigKV(),
    rateLimitMetrics: null,
  }

  const routes = await createAuthRoutes(deps)
  const app = new Hono()
    .route('/', routes)
    .onError((err, c) => {
      if (err instanceof ApiError)
        return c.json({ error: err.errorCode }, err.statusCode)
      return c.json({ error: 'internal', message: (err as Error).message }, 500)
    })

  return { app, db, handler }
}

function authorizeUrl(token: string | null) {
  const url = new URL('/api/auth/oauth2/authorize', 'http://localhost:3000')
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', 'airi-stage-electron')
  url.searchParams.set('redirect_uri', 'http://localhost:3000/api/auth/oidc/electron-callback')
  url.searchParams.set('scope', 'openid profile email offline_access')
  url.searchParams.set('state', '43123:opaque')
  url.searchParams.set('code_challenge', 'plain')
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('resource', 'http://localhost:3000')
  if (token)
    url.searchParams.set('enrollToken', token)
  return url.toString()
}

describe('authorize enrollment choke point', () => {
  let db: Database

  // NOTICE: mockDB pushSchema is slow on cold CI runners; share one DB per file.
  beforeAll(async () => {
    db = await mockDB(schema)
  }, 30_000)

  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete(account)
    await db.delete(verification)
    await db.delete(user)
  })

  it('links Steam to the session user and strips enrollToken before the auth handler', async () => {
    const { app, handler } = await buildRoutes(db, { sessionUser: { id: 'uid_ok', banned: false } })
    const token = await createEnrollmentToken(db, { steamId: '76561198000000050', profile: { name: 'Alice', image: '' } })

    const res = await app.request(authorizeUrl(token), { headers: { cookie: 'session=tok' } })

    expect(res.status).toBe(302)
    expect(handler).toHaveBeenCalledTimes(1)
    const forwardedUrl = handler.mock.calls[0][0].url
    expect(forwardedUrl).not.toContain('enrollToken')

    const accounts = await db.select().from(account).where(and(eq(account.providerId, 'steam'), eq(account.accountId, '76561198000000050')))
    expect(accounts).toHaveLength(1)
    expect(accounts[0]?.userId).toBe('uid_ok')

    const tokens = await db.select().from(verification).where(eq(verification.id, token))
    expect(tokens).toHaveLength(0)
  })

  it('applies Steam profile to empty user fields when linking', async () => {
    const { app } = await buildRoutes(db, { sessionUser: { id: 'uid_profile', banned: false } })
    const token = await createEnrollmentToken(db, { steamId: '76561198000000051', profile: { name: 'Alice', image: 'https://x/a.jpg' } })

    await app.request(authorizeUrl(token), { headers: { cookie: 'session=tok' } })

    const users = await db.select().from(user).where(eq(user.id, 'uid_profile'))
    expect(users[0]?.name).toBe('Alice')
    expect(users[0]?.image).toBe('https://x/a.jpg')
  })

  // https://github.com/moeru-ai/airi/pull/1966#discussion_r3600204293
  it('rejects an invalid enrollment token for PR #1966', async () => {
    const { app, handler } = await buildRoutes(db, { sessionUser: { id: 'uid_ok', banned: false } })

    // ROOT CAUSE:
    //
    // An authenticated request with an invalid, expired, or consumed token
    // skipped linking but still reached Better Auth after enrollToken was
    // stripped, which issued an OIDC code for a half-completed enrollment.
    //
    // Before the fix, this request returned a 302 authorization redirect.
    //
    // We fixed this by failing before Better Auth whenever token consumption
    // returns no enrollment payload.
    const res = await app.request(authorizeUrl('not-a-real-token'), { headers: { cookie: 'session=tok' } })

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'STEAM_ENROLLMENT_TOKEN_INVALID' })
    expect(handler).not.toHaveBeenCalled()

    const accounts = await db.select().from(account).where(eq(account.providerId, 'steam'))
    expect(accounts).toHaveLength(0)
  })

  // https://github.com/moeru-ai/airi/pull/1966#discussion_r3610763521
  it('preserves enrollToken across a trusted login redirect when there is no session (PR #1966)', async () => {
    // ROOT CAUSE:
    //
    // Without a session the middleware stripped enrollToken before Better Auth
    // built the login continuation. After login, authorize resumed without the
    // token, so Steam never linked even though the DB row still existed.
    //
    // Before the fix, a no-session authorize that redirected to login dropped
    // enrollToken from Location.
    //
    // We fixed this by re-attaching enrollToken only onto trusted login
    // redirects, then completing link+code on the authenticated retry.
    const handler = vi.fn(async (req: Request) => {
      const url = new URL(req.url)
      expect(url.searchParams.has('enrollToken')).toBe(false)
      return new Response(null, {
        status: 302,
        headers: {
          location: `/auth/sign-in?${url.searchParams.toString()}`,
        },
      })
    })

    const token = await createEnrollmentToken(db, { steamId: '76561198000000052', profile: null })

    const noSessionDeps: AuthRoutesDeps = {
      auth: {
        handler,
        api: { getSession: vi.fn(async () => null) },
      } as any,
      db,
      env: {
        API_SERVER_URL: 'http://localhost:3000',
        AUTH_UI_URL: 'https://accounts.airi.build/ui',
        ADDITIONAL_TRUSTED_ORIGINS: [],
      } as any,
      configKV: createConfigKV(),
      rateLimitMetrics: null,
    }

    const noSessionRoutes = await createAuthRoutes(noSessionDeps)
    const noSessionApp = new Hono().route('/', noSessionRoutes)
    const loginRedirect = await noSessionApp.request(authorizeUrl(token), { headers: {} })

    expect(loginRedirect.status).toBe(302)
    const loginLocation = new URL(loginRedirect.headers.get('location')!, 'http://localhost:3000')
    expect(loginLocation.pathname).toBe('/auth/sign-in')
    expect(loginLocation.searchParams.get('enrollToken')).toBe(token)

    const accountsBefore = await db.select().from(account).where(eq(account.providerId, 'steam'))
    expect(accountsBefore).toHaveLength(0)
    const tokensBefore = await db.select().from(verification).where(eq(verification.id, token))
    expect(tokensBefore).toHaveLength(1)

    const { app: withSessionApp, handler: withSessionHandler } = await buildRoutes(db, {
      sessionUser: { id: 'uid_retry', banned: false },
    })
    const linked = await withSessionApp.request(authorizeUrl(token), { headers: { cookie: 'session=tok' } })

    expect(linked.status).toBe(302)
    expect(withSessionHandler).toHaveBeenCalledTimes(1)
    expect(withSessionHandler.mock.calls[0][0].url).not.toContain('enrollToken')

    const accounts = await db.select().from(account).where(and(
      eq(account.providerId, 'steam'),
      eq(account.accountId, '76561198000000052'),
    ))
    expect(accounts).toHaveLength(1)
    expect(accounts[0]?.userId).toBe('uid_retry')

    const tokensAfter = await db.select().from(verification).where(eq(verification.id, token))
    expect(tokensAfter).toHaveLength(0)
  })
})
