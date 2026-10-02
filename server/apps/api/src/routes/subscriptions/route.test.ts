import type { Database } from '../../libs/db'
import type { RevenuecatSubscriptionSync } from '../../services/adapters/revenuecat-subscriptions'
import type { SubscriptionService } from '../../services/domain/subscriptions'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'
import { beforeAll, describe, expect, it } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { createSubscriptionService } from '../../services/domain/subscriptions'
import { ApiError } from '../../utils/error'
import { createSubscriptionRoutes } from './index'

import * as schema from '../../schemas'

const testUser = {
  id: 'user-1',
  name: 'Test User',
  email: 'test@example.com',
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
}

function createTestApp(subscriptions: SubscriptionService, sync: RevenuecatSubscriptionSync | null = null) {
  const routes = createSubscriptionRoutes(subscriptions, sync)
  const app = new Hono<HonoEnv>()

  app.onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json({
        error: err.errorCode,
        message: err.message,
        details: err.details,
      }, err.statusCode)
    }
    return c.json({ error: 'Internal Server Error', message: err.message }, 500)
  })

  app.use('*', async (c, next) => {
    const user = (c.env as { user?: typeof testUser })?.user
    if (user)
      c.set('user', user)
    await next()
  })

  app.route('/api/v1/subscriptions', routes)
  return app
}

describe('subscription routes', () => {
  let db: Database
  let subscriptions: SubscriptionService

  beforeAll(async () => {
    db = await mockDB(schema)
  })

  async function request(path: string, init?: RequestInit, user?: typeof testUser) {
    await db.delete(schema.subscriptionConsumption)
    await db.delete(schema.subscriptionAllowance)
    await db.delete(schema.subscription)
    await db.delete(schema.userBillingPreference)
    subscriptions = createSubscriptionService(db)
    const app = createTestApp(subscriptions)
    return app.fetch(
      new Request(`http://localhost/api/v1/subscriptions${path}`, init),
      (user ? { user } : undefined) as never,
    )
  }

  it('returns 401 when unauthenticated', async () => {
    const res = await request('/status', undefined, undefined)
    expect(res.status).toBe(401)
  })

  it('returns empty status with fallback off by default', async () => {
    const res = await request('/status', undefined, testUser)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ subscriptions: [], allowances: [], fallbackToFlux: false })
  })

  it('reads and writes the fallback preference', async () => {
    const putRes = await request('/preference', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fallbackToFlux: true }),
    }, testUser)
    expect(putRes.status).toBe(200)
    expect(await putRes.json()).toEqual({ fallbackToFlux: true })
  })

  it('rejects an invalid preference body', async () => {
    const res = await request('/preference', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fallbackToFlux: 'yes' }),
    }, testUser)
    expect(res.status).toBe(400)
  })

  it('reconciles before reading status without failing the read', async () => {
    await db.delete(schema.subscriptionConsumption)
    await db.delete(schema.subscriptionAllowance)
    await db.delete(schema.subscription)
    await db.delete(schema.userBillingPreference)
    const core = createSubscriptionService(db)
    const reconcile = async (userId: string) => {
      await core.upsertSubscription({ userId, entitlementId: 'airi_go', status: 'active' })
    }
    const app = createTestApp(core, { reconcile } as never)

    const res = await app.fetch(
      new Request('http://localhost/api/v1/subscriptions/status'),
      { user: testUser } as never,
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      subscriptions: [{ entitlementId: 'airi_go' }],
    })
  })
})
