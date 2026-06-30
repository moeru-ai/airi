import type { AuthRoutesDeps } from '..'
import type { ConfigKVService } from '../../../services/adapters/config-kv'

import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

async function buildRoutes({ sessionUser }: { sessionUser: { id: string, banned: boolean } | null }) {
  const db = await mockDB(schema)
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
  beforeEach(() => vi.clearAllMocks())

  it('links Steam to the session user and strips enrollToken before the auth handler', async () => {
    const { app, db, handler } = await buildRoutes({ sessionUser: { id: 'uid_ok', banned: false } })
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
    const { app, db } = await buildRoutes({ sessionUser: { id: 'uid_profile', banned: false } })
    const token = await createEnrollmentToken(db, { steamId: '76561198000000051', profile: { name: 'Alice', image: 'https://x/a.jpg' } })

    await app.request(authorizeUrl(token), { headers: { cookie: 'session=tok' } })

    const users = await db.select().from(user).where(eq(user.id, 'uid_profile'))
    expect(users[0]?.name).toBe('Alice')
    expect(users[0]?.image).toBe('https://x/a.jpg')
  })

  it('issues a code without linking when the token is invalid (Steam stays unlinked)', async () => {
    const { app, db, handler } = await buildRoutes({ sessionUser: { id: 'uid_ok', banned: false } })
    const res = await app.request(authorizeUrl('not-a-real-token'), { headers: { cookie: 'session=tok' } })
    expect(res.status).toBe(302)
    expect(handler).toHaveBeenCalledTimes(1)
    const accounts = await db.select().from(account).where(eq(account.providerId, 'steam'))
    expect(accounts).toHaveLength(0)
  })

  it('issues a code without linking when there is no session (token preserved for retry)', async () => {
    const { app, db, handler } = await buildRoutes({ sessionUser: null })
    const token = await createEnrollmentToken(db, { steamId: '76561198000000052', profile: null })
    const res = await app.request(authorizeUrl(token), { headers: {} })
    expect(res.status).toBe(302)
    expect(handler).toHaveBeenCalledTimes(1)
    const accounts = await db.select().from(account).where(eq(account.providerId, 'steam'))
    expect(accounts).toHaveLength(0)
    // Token must survive a no-session attempt so the user can retry after login.
    const tokens = await db.select().from(verification).where(eq(verification.id, token))
    expect(tokens).toHaveLength(1)
  })
})
