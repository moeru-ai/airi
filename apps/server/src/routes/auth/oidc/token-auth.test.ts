import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../libs/request-auth', () => ({
  resolveRequestAuth: vi.fn(),
}))

const { resolveRequestAuth } = await import('../../../libs/request-auth')
const { createOIDCTokenAuthRoute } = await import('./token-auth')
const mockedResolveRequestAuth = vi.mocked(resolveRequestAuth)

const env = {
  API_SERVER_URL: 'http://localhost:3000',
} as Parameters<typeof createOIDCTokenAuthRoute>[0]['env']

describe('createOIDCTokenAuthRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null from get-session when request auth is missing', async () => {
    mockedResolveRequestAuth.mockResolvedValueOnce(null)
    const auth = { api: { getSession: vi.fn() } } as Parameters<typeof createOIDCTokenAuthRoute>[0]['auth']
    const app = createOIDCTokenAuthRoute({ auth, env })

    const res = await app.request('/get-session', {
      headers: { authorization: 'Bearer missing' },
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toBeNull()
    expect(mockedResolveRequestAuth).toHaveBeenCalledTimes(1)
  })

  it('adds a Gravatar fallback when session user has no image', async () => {
    mockedResolveRequestAuth.mockResolvedValueOnce({
      user: {
        id: 'user-1',
        email: 'Hello@Example.COM ',
        name: 'User',
        image: null,
        emailVerified: true,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
      session: {
        id: 'session-1',
        token: 'token-1',
        userId: 'user-1',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        expiresAt: new Date('2026-01-02T00:00:00Z'),
        ipAddress: null,
        userAgent: null,
      },
    })
    const app = createOIDCTokenAuthRoute({ auth: {} as Parameters<typeof createOIDCTokenAuthRoute>[0]['auth'], env })

    const res = await app.request('/get-session')
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.user.image).toBe(
      'https://www.gravatar.com/avatar/1753bdb368271a785887ddbfb926164f2f7c6a88f609c07ff0401c5572955206?d=identicon&s=200',
    )
    expect(body.user.email).toBe('Hello@Example.COM ')
    expect(body.session.id).toBe('session-1')
  })

  it('preserves explicit user image over Gravatar fallback', async () => {
    mockedResolveRequestAuth.mockResolvedValueOnce({
      user: {
        id: 'user-1',
        email: 'person@example.com',
        name: 'User',
        image: 'https://cdn.example.com/avatar.png',
        emailVerified: true,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
      session: {
        id: 'session-1',
        token: 'token-1',
        userId: 'user-1',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        expiresAt: new Date('2026-01-02T00:00:00Z'),
        ipAddress: null,
        userAgent: null,
      },
    })
    const app = createOIDCTokenAuthRoute({ auth: {} as Parameters<typeof createOIDCTokenAuthRoute>[0]['auth'], env })

    const res = await app.request('/get-session')
    const body = await res.json()

    expect(body.user.image).toBe('https://cdn.example.com/avatar.png')
  })

  it('acknowledges sign-out compatibility endpoint', async () => {
    const app = createOIDCTokenAuthRoute({ auth: {} as Parameters<typeof createOIDCTokenAuthRoute>[0]['auth'], env })

    const res = await app.request('/sign-out', { method: 'POST' })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
  })

  it('returns list-sessions result based on request auth state', async () => {
    const session = {
      id: 'session-1',
      token: 'token-1',
      userId: 'user-1',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      expiresAt: new Date('2026-01-02T00:00:00Z'),
      ipAddress: null,
      userAgent: null,
    }
    mockedResolveRequestAuth
      .mockResolvedValueOnce({
        user: {
          id: 'user-1',
          email: 'person@example.com',
          name: 'User',
          image: null,
          emailVerified: true,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-01T00:00:00Z'),
        },
        session,
      })
      .mockResolvedValueOnce(null)
    const app = createOIDCTokenAuthRoute({ auth: {} as Parameters<typeof createOIDCTokenAuthRoute>[0]['auth'], env })

    const withSession = await app.request('/list-sessions')
    const withoutSession = await app.request('/list-sessions')

    expect(await withSession.json()).toEqual([{
      ...session,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
    }])
    expect(await withoutSession.json()).toEqual([])
  })
})
