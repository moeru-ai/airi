import type { AuthSession } from '@proj-airi/auth-shared'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { oidcJwtBearer } from '../plugins/oidc-jwt-bearer'

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
  const headers = new Headers({ Authorization: 'Bearer signed.jwt.token' })

  return {
    createSession,
    findOne,
    findUserById,
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
        },
        secret: 'test-secret',
        authCookies: {
          sessionToken: { name: 'better-auth.session_token' },
        },
      },
    },
  }
}

interface BeforeHookResult {
  context?: {
    headers?: Headers
    session?: AuthSession
  }
}

async function runBeforeHook(context: ReturnType<typeof createContext>['context']) {
  const hook = oidcJwtBearer({
    PUBLIC_URL: 'https://api.airi.test',
  } as never).hooks?.before?.[0]
  if (!hook)
    throw new TypeError('Expected the OIDC JWT plugin to register a before hook')

  return await hook.handler(context as never) as BeforeHookResult | undefined
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
    expect(result).toMatchObject({
      context: {
        session: {
          session: {
            id: 'access-token-1',
            userId: user.id,
            createdAt: new Date(0),
          },
          user,
        },
      },
    })
    expect(result?.context).not.toHaveProperty('headers')
  })

  it('reuses an active original session for sensitive middleware', async () => {
    const { context, createSession } = createContext(persistedSession)

    const result = await runBeforeHook(context)

    expect(createSession).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      context: {
        session: { session: persistedSession, user },
      },
    })
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
    expect(result?.context?.headers).toBeUndefined()
    expect(result?.context?.session?.session).toMatchObject({
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

    expect(result?.context?.headers).toBeUndefined()
    expect(result?.context?.session?.session).toMatchObject({
      id: 'access-token-1',
      createdAt: new Date(0),
    })
  })
})
