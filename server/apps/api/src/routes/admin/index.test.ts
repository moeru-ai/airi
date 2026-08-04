import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createAdminRoutes } from '.'
import { mockDB } from '../../libs/mock-db'

import * as schema from '../../schemas'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('admin metrics', () => {
  it('reuses a snapshot for 60 seconds before reading fresh metrics', async () => {
    let now = Date.parse('2026-08-04T00:00:00.000Z')
    vi.spyOn(Date, 'now').mockImplementation(() => now)

    const db = await mockDB(schema)
    await db.insert(schema.user).values({
      id: 'admin-1',
      name: 'Admin',
      email: 'admin@example.com',
      emailVerified: true,
      role: 'admin',
    })

    const app = new Hono<HonoEnv>()
      .use('*', async (c, next) => {
        c.set('user', {
          id: 'admin-1',
          name: 'Admin',
          email: 'admin@example.com',
          emailVerified: true,
          image: null,
          role: 'admin',
          banned: false,
          banReason: null,
          banExpires: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        c.set('session', null)
        await next()
      })
      .route('/api/admin', createAdminRoutes({
        db,
        billingService: {} as never,
        configKV: {} as never,
      }))

    const firstResponse = await app.request('/api/admin/metrics')
    expect(firstResponse.status).toBe(200)
    expect(await firstResponse.json()).toMatchObject({ totalUsers: 1, verifiedUsers: 1, adminSeats: 1 })

    await db.insert(schema.user).values({
      id: 'user-2',
      name: 'User',
      email: 'user@example.com',
      emailVerified: false,
    })

    const cachedResponse = await app.request('/api/admin/metrics')
    expect(cachedResponse.status).toBe(200)
    expect(await cachedResponse.json()).toMatchObject({ totalUsers: 1, verifiedUsers: 1, adminSeats: 1 })

    now += 60_001
    const refreshedResponse = await app.request('/api/admin/metrics')
    expect(refreshedResponse.status).toBe(200)
    expect(await refreshedResponse.json()).toMatchObject({ totalUsers: 2, verifiedUsers: 1, adminSeats: 1 })
  })
})
