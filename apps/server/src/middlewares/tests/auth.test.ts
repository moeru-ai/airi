import type { Database } from '../../libs/db'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { ApiError } from '../../utils/error'
import { authGuard, sessionMiddleware } from '../auth'

import * as schema from '../../schemas'

vi.mock('../../libs/request-auth', () => ({
  resolveRequestAuth: vi.fn(),
}))

const { resolveRequestAuth } = await import('../../libs/request-auth')
const mockResolveRequestAuth = vi.mocked(resolveRequestAuth)

const mockAuth = {} as any
const mockEnv = { API_SERVER_URL: 'http://localhost:3000' } as any

function buildApp(db: Database) {
  const app = new Hono<HonoEnv>()

  app.onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json({ error: err.errorCode, message: err.message }, err.statusCode)
    }
    return c.json({ error: 'INTERNAL_SERVER_ERROR', message: String(err) }, 500)
  })

  app.use('*', sessionMiddleware(mockAuth, mockEnv, db))
  app.use('*', authGuard)
  app.get('/protected', c => c.json({ userId: c.get('user')?.id }))

  return app
}

describe('sessionMiddleware + authGuard — soft-delete blocking', () => {
  let db: Database
  let app: Hono<HonoEnv>
  let activeUser: typeof schema.user.$inferSelect
  let deletedUser: typeof schema.user.$inferSelect

  beforeEach(async () => {
    db = await mockDB(schema)
    app = buildApp(db)

    const now = new Date()

    const [au] = await db.insert(schema.user).values({
      id: 'active-user-1',
      name: 'Active User',
      email: 'active@example.com',
    }).returning()
    activeUser = au

    const [du] = await db.insert(schema.user).values({
      id: 'deleted-user-1',
      name: 'Deleted User',
      email: 'deleted@example.com',
      deletedAt: now,
    }).returning()
    deletedUser = du
  })

  it('allows active user through to protected route', async () => {
    mockResolveRequestAuth.mockResolvedValue({
      user: { id: activeUser.id, email: activeUser.email, name: activeUser.name } as any,
      session: { id: 'session-1', userId: activeUser.id } as any,
    })

    const res = await app.request('/protected', {
      headers: { Authorization: 'Bearer valid-token' },
    })

    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.userId).toBe(activeUser.id)
  })

  it('blocks soft-deleted user — sessionMiddleware nulls user, authGuard returns 401', async () => {
    mockResolveRequestAuth.mockResolvedValue({
      user: { id: deletedUser.id, email: deletedUser.email, name: deletedUser.name } as any,
      session: { id: 'session-2', userId: deletedUser.id } as any,
    })

    const res = await app.request('/protected', {
      headers: { Authorization: 'Bearer valid-token' },
    })

    expect(res.status).toBe(401)
    const body = await res.json() as any
    expect(body.error).toBe('UNAUTHORIZED')
  })

  it('returns 401 when no session exists (unauthenticated request)', async () => {
    mockResolveRequestAuth.mockResolvedValue(null)

    const res = await app.request('/protected')

    expect(res.status).toBe(401)
    const body = await res.json() as any
    expect(body.error).toBe('UNAUTHORIZED')
  })

  it('skips soft-delete check for /api/auth/* paths', async () => {
    const authApp = new Hono<HonoEnv>()
    authApp.onError((err, c) => {
      if (err instanceof ApiError) {
        return c.json({ error: err.errorCode }, err.statusCode)
      }
      return c.json({ error: 'INTERNAL_SERVER_ERROR' }, 500)
    })
    authApp.use('*', sessionMiddleware(mockAuth, mockEnv, db))
    authApp.get('/api/auth/session', c => c.json({ user: c.get('user') }))

    const res = await authApp.request('/api/auth/session')
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.user).toBeNull()
  })
})
