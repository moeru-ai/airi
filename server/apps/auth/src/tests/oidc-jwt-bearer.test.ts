import type { AuthSession } from '@proj-airi/auth-shared'

import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { dispatchAuthEndpoint, listUserAccounts } from 'better-auth/api'
import { bearer, jwt } from 'better-auth/plugins'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { oidcJwtBearer } from '../plugins/oidc-jwt-bearer'

/**
 * A token in the compact JWS shape: three base64url parts. The verifier is mocked, so the signature is not real.
 * `jwsCompact` rejects a part whose length base64url never produces, such as the 5 letters of `token`.
 */
const SIGNED_JWT = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEifQ.c2lnbmF0dXJl'

const { jwtVerify } = vi.hoisted(() => ({
  jwtVerify: vi.fn(),
}))

vi.mock('jose', async (importOriginal) => {
  const original = await importOriginal<typeof import('jose')>()
  return {
    ...original,
    createLocalJWKSet: vi.fn(() => 'local-jwks'),
    jwtVerify,
  }
})

const user: AuthSession['user'] = {
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

const persistedSession: AuthSession['session'] = {
  id: 'session-1',
  token: 'persisted-session-token',
  userId: user.id,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  expiresAt: new Date('2099-01-01T00:00:00.000Z'),
  ipAddress: null,
  userAgent: null,
}

function createContext(session: AuthSession['session'] | null) {
  const createSession = vi.fn()
  const findOne = vi.fn(async (): Promise<unknown> => session)
  const findUserById = vi.fn(async (): Promise<unknown> => user)
  const findAccounts = vi.fn(async (): Promise<unknown[]> => [])
  const headers = new Headers({ Authorization: `Bearer ${SIGNED_JWT}` })

  return {
    createSession,
    findOne,
    findUserById,
    findAccounts,
    context: {
      request: new Request('https://api.airi.test/api/auth/update-user', { headers }),
      headers,
      context: {
        adapter: {
          findMany: vi.fn(async () => [{
            id: 'key-1',
            publicKey: JSON.stringify({ kty: 'RSA' }),
          }]),
          findOne,
        },
        internalAdapter: {
          createSession,
          findUserById,
          findAccounts,
        },
        secret: 'test-secret',
        authCookies: {
          sessionToken: { name: 'better-auth.session_token' },
        },
        session: null as AuthSession | null,
      },
    },
  }
}

interface BeforeHookResult {
  context?: {
    headers?: Headers
  }
}

function createPlugin() {
  return oidcJwtBearer({
    PUBLIC_URL: 'https://api.airi.test',
  } as never)
}

async function runBeforeHook(context: ReturnType<typeof createContext>['context']) {
  const hook = createPlugin().hooks?.before?.[0]
  if (!hook)
    throw new TypeError('Expected the OIDC JWT plugin to register a before hook')

  return await hook.handler(context as never) as BeforeHookResult | undefined
}

/** Runs sign-out through a real Better Auth instance, with the plugin order of `createAuth`. */
async function signOutWithJwt(sessions: AuthSession['session'][]) {
  const db: Record<string, Record<string, unknown>[]> = {
    user: [user],
    session: sessions,
    account: [],
    verification: [],
    jwks: [{ id: 'key-1', publicKey: JSON.stringify({ kty: 'RSA' }), privateKey: 'unused', createdAt: user.createdAt }],
  }
  const auth = betterAuth({
    baseURL: 'https://api.airi.test',
    secret: 'test-secret-test-secret-test-secret',
    database: memoryAdapter(db),
    plugins: [bearer(), jwt(), createPlugin()],
    logger: { disabled: true },
  })

  const response = await auth.handler(new Request('https://api.airi.test/api/auth/sign-out', {
    method: 'POST',
    headers: { Authorization: `Bearer ${SIGNED_JWT}` },
  }))
  return { db, response }
}

describe('oidcJwtBearer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    jwtVerify.mockResolvedValue({
      payload: {
        sub: user.id,
        sid: persistedSession.id,
        jti: 'access-token-1',
        exp: 4_070_908_800,
        iat: 1_767_225_600,
      },
    })
  })

  it('uses request-scoped identity without creating a session row', async () => {
    const { context, createSession, findOne } = createContext(null)

    // ROOT CAUSE:
    //
    // The old bridge created a Better Auth session for every JWT request.
    // PostgreSQL does not delete expired rows automatically, so normal client
    // polling produced millions of permanent records.
    //
    // The plugin now carries verified identity in the current request only.
    const result = await runBeforeHook(context)

    expect(createSession).not.toHaveBeenCalled()
    expect(findOne).toHaveBeenCalledTimes(1)
    expect(result).toBeUndefined()
    expect(context.context.session).toMatchObject({
      session: {
        id: 'access-token-1',
        userId: user.id,
        createdAt: new Date(0),
      },
      user,
    })
  })

  it('lets session middleware accept a JWT without an active original session', async () => {
    const { context, findAccounts } = createContext(null)
    findAccounts.mockResolvedValueOnce([{
      id: 'account-1',
      providerId: 'credential',
      accountId: user.id,
      userId: user.id,
      scope: 'openid,profile',
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }])

    // ROOT CAUSE:
    //
    // The plugin returned `{ context: { session } }`. Better Auth merges that
    // value into the endpoint context, but session middleware reads
    // `ctx.context.session`. A JWT whose `sid` session had expired therefore
    // received 401 from `/list-accounts`.
    //
    // The plugin now sets the per-request AuthContext session.
    const result = await dispatchAuthEndpoint(listUserAccounts, {
      headers: context.headers,
      context: {
        ...context.context,
        options: { plugins: [createPlugin()] },
        logger: { level: 'error', error: vi.fn() },
      } as never,
    })

    expect(findAccounts).toHaveBeenCalledWith(user.id)
    expect(result).toEqual([expect.objectContaining({
      id: 'account-1',
      scopes: ['openid', 'profile'],
    })])
  })

  it('reuses an active original session for sensitive middleware', async () => {
    const { context, createSession } = createContext(persistedSession)

    const result = await runBeforeHook(context)

    expect(createSession).not.toHaveBeenCalled()
    expect(context.context.session).toBeNull()
    expect(result?.context?.headers?.get('cookie')).toContain('better-auth.session_token=')
    expect(result?.context?.headers?.get('cookie')).toContain('persisted-session-token')
  })

  it('does not expose an expired original session to sensitive middleware', async () => {
    const expiredSession = {
      ...persistedSession,
      expiresAt: new Date('2025-01-01T00:00:00.000Z'),
    }
    const { context, createSession } = createContext(expiredSession)

    const result = await runBeforeHook(context)

    expect(createSession).not.toHaveBeenCalled()
    expect(result).toBeUndefined()
    expect(context.context.session?.session).toMatchObject({
      id: 'access-token-1',
      createdAt: new Date(0),
    })
  })

  it('rejects a banned user before exposing request identity', async () => {
    const { context, createSession, findUserById } = createContext(null)
    findUserById.mockResolvedValueOnce({ ...user, banned: true })

    await expect(runBeforeHook(context)).rejects.toMatchObject({
      body: { code: 'BANNED_USER' },
    })
    expect(createSession).not.toHaveBeenCalled()
  })

  it('rejects a malformed adapter user before exposing request identity', async () => {
    const { context, findUserById } = createContext(null)
    findUserById.mockResolvedValueOnce({ ...user, emailVerified: 'yes' })

    await expect(runBeforeHook(context)).resolves.toBeUndefined()
  })

  it('ignores a malformed persisted session for sensitive middleware', async () => {
    const { context, findOne } = createContext(null)
    findOne.mockResolvedValueOnce({ ...persistedSession, expiresAt: '2099-01-01' })

    const result = await runBeforeHook(context)

    expect(result).toBeUndefined()
    expect(context.context.session?.session).toMatchObject({
      id: 'access-token-1',
      createdAt: new Date(0),
    })
  })

  it('lets Better Auth sign-out delete the active original session of a JWT', async () => {
    const otherSession = { ...persistedSession, id: 'session-2', token: 'other-session-token' }

    const { db, response } = await signOutWithJwt([{ ...persistedSession }, otherSession])

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true })
    expect(db.session).toEqual([otherSession])
    expect(response.headers.get('set-cookie')).toMatch(/session_token=;[^,]*Max-Age=0/)
  })

  it('answers sign-out with success when the JWT has no active original session', async () => {
    const expiredSession = { ...persistedSession, expiresAt: new Date('2025-01-01T00:00:00.000Z') }

    // The stage client calls `/sign-out` with only a Bearer token when it has no ID token.
    // A token whose `sid` session is gone must not make that call fail.
    const { db, response } = await signOutWithJwt([expiredSession])

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true })
    expect(db.session).toEqual([expiredSession])
  })
})
