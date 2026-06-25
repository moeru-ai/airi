import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'

import { ApiError } from '../../utils/error'
import { adminGuard } from '../admin-guard'

interface MockUser {
  id: string
  email: string
  role?: string | null
}

function buildHonoApp(attachUser: MockUser | null) {
  return new Hono()
    .use('*', async (c, next) => {
      // Stand-in for sessionMiddleware: just sets the user.
      ;(c as any).set('user', attachUser)
      await next()
    })
    .use('*', adminGuard)
    .get('/protected', c => c.json({ ok: true }))
    .onError((err, c) => {
      if (err instanceof ApiError)
        return c.json({ error: err.errorCode }, err.statusCode)
      throw err
    })
}

describe('adminGuard middleware', () => {
  it('returns 401 when no user is present', async () => {
    const res = await buildHonoApp(null).request('/protected')
    expect(res.status).toBe(401)
  })

  it('returns 403 when the user has no role', async () => {
    const res = await buildHonoApp({ id: 'u1', email: 'u@example.com', role: null }).request('/protected')
    expect(res.status).toBe(403)
  })

  it('returns 403 when the user role is not admin', async () => {
    const res = await buildHonoApp({ id: 'u1', email: 'u@example.com', role: 'user' }).request('/protected')
    expect(res.status).toBe(403)
  })

  it('allows a user with the admin role', async () => {
    const res = await buildHonoApp({ id: 'a1', email: 'a@example.com', role: 'admin' }).request('/protected')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('allows a user whose comma-separated roles include admin', async () => {
    const res = await buildHonoApp({ id: 'a1', email: 'a@example.com', role: 'user,admin' }).request('/protected')
    expect(res.status).toBe(200)
  })
})
