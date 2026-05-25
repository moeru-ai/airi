import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../libs/request-auth', () => ({
  resolveRequestAuth: vi.fn(),
}))

const { resolveRequestAuth } = await import('../../libs/request-auth')
const { authGuard, sessionMiddleware } = await import('../auth')
const mockedResolveRequestAuth = vi.mocked(resolveRequestAuth)

function createContext(path: string, headers = new Headers()) {
  const values = new Map<string, unknown>()
  return {
    req: {
      path,
      raw: { headers },
    },
    set: vi.fn((key: string, value: unknown) => values.set(key, value)),
    get: vi.fn((key: string) => values.get(key)),
  }
}

describe('sessionMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('bypasses auth lookup for auth UI and discovery routes', async () => {
    for (const path of [
      '/auth/sign-in',
      '/api/auth/get-session',
      '/.well-known/oauth-authorization-server/api/auth',
    ]) {
      const context = createContext(path)
      const next = vi.fn(async () => undefined)
      const middleware = sessionMiddleware({} as Parameters<typeof sessionMiddleware>[0], {} as Parameters<typeof sessionMiddleware>[1])

      await middleware(context as Parameters<typeof middleware>[0], next)

      expect(context.set).toHaveBeenCalledWith('user', null)
      expect(context.set).toHaveBeenCalledWith('session', null)
      expect(next).toHaveBeenCalledTimes(1)
    }

    expect(mockedResolveRequestAuth).not.toHaveBeenCalled()
  })

  it('sets null session values when request auth cannot resolve a user', async () => {
    mockedResolveRequestAuth.mockResolvedValueOnce(null)
    const context = createContext('/api/v1/characters', new Headers({ authorization: 'Bearer missing' }))
    const next = vi.fn(async () => undefined)
    const auth = { api: { getSession: vi.fn() } }
    const env = { API_SERVER_URL: 'http://localhost:3000' }
    const middleware = sessionMiddleware(auth as Parameters<typeof sessionMiddleware>[0], env as Parameters<typeof sessionMiddleware>[1])

    await middleware(context as Parameters<typeof middleware>[0], next)

    expect(mockedResolveRequestAuth).toHaveBeenCalledWith(auth, env, context.req.raw.headers)
    expect(context.set).toHaveBeenCalledWith('user', null)
    expect(context.set).toHaveBeenCalledWith('session', null)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('injects resolved user and session into context', async () => {
    const session = {
      user: { id: 'user-1' },
      session: { id: 'session-1', userId: 'user-1' },
    }
    mockedResolveRequestAuth.mockResolvedValueOnce(session as Awaited<ReturnType<typeof resolveRequestAuth>>)
    const context = createContext('/api/v1/characters')
    const next = vi.fn(async () => undefined)
    const middleware = sessionMiddleware({} as Parameters<typeof sessionMiddleware>[0], {} as Parameters<typeof sessionMiddleware>[1])

    await middleware(context as Parameters<typeof middleware>[0], next)

    expect(context.set).toHaveBeenCalledWith('user', session.user)
    expect(context.set).toHaveBeenCalledWith('session', session.session)
    expect(next).toHaveBeenCalledTimes(1)
  })
})

describe('authGuard', () => {
  it('throws UNAUTHORIZED when user is missing from context', async () => {
    const context = createContext('/api/v1/characters')

    await expect(authGuard(context as Parameters<typeof authGuard>[0], vi.fn())).rejects.toMatchObject({
      statusCode: 401,
      errorCode: 'UNAUTHORIZED',
    })
  })

  it('continues when user is present in context', async () => {
    const context = createContext('/api/v1/characters')
    context.set('user', { id: 'user-1' })
    const next = vi.fn(async () => undefined)

    await authGuard(context as Parameters<typeof authGuard>[0], next)

    expect(next).toHaveBeenCalledTimes(1)
  })
})
