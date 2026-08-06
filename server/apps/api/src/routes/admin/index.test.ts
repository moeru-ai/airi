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
    const recordUserMetrics = vi.fn()
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
        userMetricsRecorder: { record: recordUserMetrics },
      }))

    const firstResponse = await app.request('/api/admin/metrics')
    expect(firstResponse.status).toBe(200)
    const firstMetrics = await firstResponse.json()
    expect(firstMetrics).toMatchObject({
      totalUsers: 1,
      verifiedUsers: 1,
      adminSeats: 1,
      activeSessions: 0,
      distinctActiveUsers: 0,
    })
    expect(firstMetrics).not.toHaveProperty('rollingActiveUsers')
    expect(recordUserMetrics).toHaveBeenLastCalledWith(expect.objectContaining({
      totalUsers: 1,
      activeSessions: 0,
      distinctActiveUsers: 0,
    }), now)

    await db.insert(schema.user).values({
      id: 'user-2',
      name: 'User',
      email: 'user@example.com',
      emailVerified: false,
    })

    now += 30_000
    const cachedResponse = await app.request('/api/admin/metrics')
    expect(cachedResponse.status).toBe(200)
    expect(await cachedResponse.json()).toMatchObject({ totalUsers: 1, verifiedUsers: 1, adminSeats: 1 })
    expect(recordUserMetrics).toHaveBeenCalledTimes(2)
    expect(recordUserMetrics).toHaveBeenLastCalledWith(expect.anything(), Date.parse('2026-08-04T00:00:00.000Z'))

    now += 30_001
    const refreshedResponse = await app.request('/api/admin/metrics')
    expect(refreshedResponse.status).toBe(200)
    expect(await refreshedResponse.json()).toMatchObject({ totalUsers: 2, verifiedUsers: 1, adminSeats: 1 })
    expect(recordUserMetrics).toHaveBeenCalledTimes(3)
    expect(recordUserMetrics).toHaveBeenLastCalledWith(expect.anything(), now)
  })
})
