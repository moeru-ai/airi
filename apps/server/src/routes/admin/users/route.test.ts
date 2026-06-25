import type { AdminUsersService } from '../../../services/domain/admin/users'
import type { HonoEnv } from '../../../types/hono'

import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import { createAdminUsersRoutes } from '.'
import { ApiError } from '../../../utils/error'

interface MockUser {
  id: string
  email: string
  role?: string | null
}

const ADMIN: MockUser = { id: 'admin-1', email: 'admin@example.com', role: 'admin' }

function createServices() {
  const adminUsersService = {
    setBalance: vi.fn(async () => ({ userId: 'uid_1', email: 'u@example.com', balanceBefore: 100, balanceAfter: 0, fluxTransactionId: 'tx-1' })),
  } as unknown as AdminUsersService

  return { adminUsersService }
}

function createTestApp(services: ReturnType<typeof createServices>, user: MockUser | null) {
  return new Hono<HonoEnv>()
    .use('*', async (c, next) => {
      ;(c as any).set('user', user)
      await next()
    })
    .route('/api/admin/users', createAdminUsersRoutes(services.adminUsersService))
    .onError((err, c) => {
      if (err instanceof ApiError)
        return c.json({ error: err.errorCode, details: err.details }, err.statusCode)
      return c.json({ error: 'internal', message: (err as Error).message }, 500)
    })
}

function post(app: Hono<HonoEnv>, path: string, body: unknown) {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('admin users — auth guards', () => {
  it('returns 401 when unauthenticated', async () => {
    const services = createServices()
    const app = createTestApp(services, null)
    const res = await post(app, '/api/admin/users/balance', { email: 'u@example.com', balance: 0 })
    expect(res.status).toBe(401)
    expect(services.adminUsersService.setBalance).not.toHaveBeenCalled()
  })

  it('returns 403 for a non-admin user', async () => {
    const services = createServices()
    const app = createTestApp(services, { id: 'u', email: 'user@example.com', role: 'user' })
    const res = await post(app, '/api/admin/users/balance', { email: 'u@example.com', balance: 0 })
    expect(res.status).toBe(403)
    expect(services.adminUsersService.setBalance).not.toHaveBeenCalled()
  })
})

describe('admin users — POST /balance', () => {
  it('sets balance and forwards the resolved admin id', async () => {
    const services = createServices()
    const app = createTestApp(services, ADMIN)
    const res = await post(app, '/api/admin/users/balance', { email: 'u@example.com', balance: 0 })

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ balanceAfter: 0, fluxTransactionId: 'tx-1' })
    expect(services.adminUsersService.setBalance).toHaveBeenCalledWith({
      email: 'u@example.com',
      balance: 0,
      description: 'Admin set balance to 0',
      issuedByUserId: 'admin-1',
    })
  })

  it('rejects a negative balance', async () => {
    const services = createServices()
    const app = createTestApp(services, ADMIN)
    const res = await post(app, '/api/admin/users/balance', { email: 'u@example.com', balance: -1 })
    expect(res.status).toBe(400)
    expect(services.adminUsersService.setBalance).not.toHaveBeenCalled()
  })

  it('rejects when neither email nor userId is provided', async () => {
    const services = createServices()
    const app = createTestApp(services, ADMIN)
    const res = await post(app, '/api/admin/users/balance', { balance: 0 })
    expect(res.status).toBe(400)
  })

  it('rejects when both email and userId are provided', async () => {
    const services = createServices()
    const app = createTestApp(services, ADMIN)
    const res = await post(app, '/api/admin/users/balance', { email: 'u@example.com', userId: 'uid_1', balance: 0 })
    expect(res.status).toBe(400)
    expect(services.adminUsersService.setBalance).not.toHaveBeenCalled()
  })
})
