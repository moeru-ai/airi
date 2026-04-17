import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../utils/error'
import { authGuard, sessionMiddleware } from '../auth'

vi.mock('../../libs/request-auth', () => ({
  resolveRequestAuth: vi.fn(),
}))

const { resolveRequestAuth } = await import('../../libs/request-auth')
const mockResolveRequestAuth = vi.mocked(resolveRequestAuth)

const mockAuth = {} as any
const mockEnv = { API_SERVER_URL: 'http://localhost:3000' } as any

function buildApp() {
  const app = new Hono<HonoEnv>()

  app.onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json({ error: err.errorCode, message: err.message }, err.statusCode)
    }
    return c.json({ error: 'INTERNAL_SERVER_ERROR', message: String(err) }, 500)
  })

  app.use('*', sessionMiddleware(mockAuth, mockEnv))
  app.use('*', authGuard)
  app.get('/protected', c => c.json({ userId: c.get('user')?.id }))

  return app
}

describe('sessionMiddleware + authGuard', () => {
  let app: Hono<HonoEnv>

  beforeEach(() => {
    mockResolveRequestAuth.mockReset()
    app = buildApp()
  })

  it('allows authenticated user through to protected route without an extra DB round-trip', async () => {
    // ROOT CAUSE:
    //
    // The previous middleware called `db.select({ deletedAt }).from(user)`
    // on every request to defend against soft-deleted users sneaking in.
    // That defence is unnecessary because `POST /api/v1/user/delete` runs
    // user.deletedAt + DELETE session in a single transaction (see
    // `routes/user/index.ts`), so by the time we get here the session row
    // can only exist for a non-deleted user.
    //
    // We dropped the SELECT to remove a synchronous DB hop from the hot
    // request path. The middleware no longer accepts a `db` argument, and
    // this test pins that contract: it's constructed with no DB at all and
    // an authenticated request still resolves cleanly.
    mockResolveRequestAuth.mockResolvedValue({
      user: { id: 'active-user-1', email: 'active@example.com', name: 'Active User' } as any,
      session: { id: 'session-1', userId: 'active-user-1' } as any,
    })

    const res = await app.request('/protected', {
      headers: { Authorization: 'Bearer valid-token' },
    })

    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.userId).toBe('active-user-1')
  })

  it('returns 401 when no session exists (unauthenticated request)', async () => {
    mockResolveRequestAuth.mockResolvedValue(null)

    const res = await app.request('/protected')

    expect(res.status).toBe(401)
    const body = await res.json() as any
    expect(body.error).toBe('UNAUTHORIZED')
  })

  it('skips session lookup entirely for /api/auth/* paths so better-auth handles it', async () => {
    const authApp = new Hono<HonoEnv>()
    authApp.onError((err, c) => {
      if (err instanceof ApiError) {
        return c.json({ error: err.errorCode }, err.statusCode)
      }
      return c.json({ error: 'INTERNAL_SERVER_ERROR' }, 500)
    })
    authApp.use('*', sessionMiddleware(mockAuth, mockEnv))
    authApp.get('/api/auth/session', c => c.json({ user: c.get('user') }))

    const res = await authApp.request('/api/auth/session')
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.user).toBeNull()
    expect(mockResolveRequestAuth).not.toHaveBeenCalled()
  })
})
