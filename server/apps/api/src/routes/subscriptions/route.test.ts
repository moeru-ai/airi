import type { Database } from '../../libs/db'
import type { RevenuecatStatus, SubscriptionEntitlement } from '../../services/adapters/revenuecat-status'
import type { SubscriptionService } from '../../services/domain/subscriptions'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'
import { beforeAll, describe, expect, it } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { MICRO_PER_CREDIT } from '../../services/domain/billing/credit-posting'
import { createSubscriptionService } from '../../services/domain/subscriptions'
import { ApiError } from '../../utils/error'
import { allowanceRemainingPercent, createSubscriptionRoutes } from './index'

import * as schema from '../../schemas'

const testUser = {
  id: 'user-1',
  name: 'Test User',
  email: 'test@example.com',
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
}

function createEntitlements(subscriptions: SubscriptionEntitlement[] = []): Pick<RevenuecatStatus, 'read'> {
  return { read: async () => subscriptions }
}

function createTestApp(
  subscriptions: SubscriptionService,
  entitlements: Pick<RevenuecatStatus, 'read'> = createEntitlements(),
) {
  const routes = createSubscriptionRoutes(subscriptions, entitlements)
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

describe('allowanceRemainingPercent', () => {
  it('returns null when the grant is empty', () => {
    expect(allowanceRemainingPercent(0, 0)).toBeNull()
  })

  it('rounds the remaining share and caps it at 100', () => {
    expect(allowanceRemainingPercent(2000, 1440)).toBe(72)
    expect(allowanceRemainingPercent(2000, 0)).toBe(0)
    expect(allowanceRemainingPercent(2000, 2500)).toBe(100)
  })
})

describe('subscription routes', () => {
  let db: Database
  let subscriptions: SubscriptionService

  beforeAll(async () => {
    db = await mockDB(schema)
  })

  async function request(path: string, init?: RequestInit, user?: typeof testUser) {
    await db.delete(schema.subscriptionConsumption)
    await db.delete(schema.subscriptionAllowance)
    await db.delete(schema.revenuecatEvent)
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

  it('returns the remaining percent and omits credit counts', async () => {
    await db.delete(schema.subscriptionConsumption)
    await db.delete(schema.subscriptionAllowance)
    await db.delete(schema.revenuecatEvent)
    await db.delete(schema.userBillingPreference)
    const core = createSubscriptionService(db)
    const periodEnd = new Date(Date.now() + 60_000)
    await core.openPeriod({
      userId: testUser.id,
      entitlementId: 'airi_go',
      grantedCredit: 2000,
      periodStart: new Date(),
      periodEnd,
      eventKey: 'event-percent',
    })
    await core.debitCredits({
      userId: testUser.id,
      microCredit: 560 * MICRO_PER_CREDIT,
      requestId: 'req-percent',
    })
    const app = createTestApp(core, createEntitlements([{
      entitlementId: 'airi_go',
      productId: 'rc_go_monthly',
      store: 'app_store',
      environment: 'SANDBOX',
      status: 'active',
      expiresAt: periodEnd.toISOString(),
    }]))

    const res = await app.fetch(
      new Request('http://localhost/api/v1/subscriptions/status'),
      { user: testUser } as never,
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      subscriptions: [{ entitlementId: 'airi_go', status: 'active' }],
      allowances: [{ entitlementId: 'airi_go', remainingPercent: 72 }],
    })
    expect(body).not.toHaveProperty('allowances.0.grantedCredit')
    expect(body).not.toHaveProperty('allowances.0.usedCredit')
    expect(body).not.toHaveProperty('allowances.0.remainingCredit')
    expect(body).not.toHaveProperty('allowances.0.remainingMicro')
    expect(body).not.toHaveProperty('allowances.0.unsettledMicroCredit')
    expect(body).not.toHaveProperty('allowances.0.periodStart')
    expect(body).not.toHaveProperty('allowances.0.periodEnd')
  })
})
