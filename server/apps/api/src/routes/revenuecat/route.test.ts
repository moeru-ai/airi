import type { Database } from '../../libs/db'
import type { ConfigDefinitions, ConfigKVService } from '../../services/adapters/config-kv'
import type { SubscriberEntitlement } from '../../services/adapters/revenuecat-subscriber'
import type { RevenuecatSubscriptionSync } from '../../services/adapters/revenuecat-subscriptions'
import type { HonoEnv } from '../../types/hono'

import { createHmac } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { createTestRedis } from '../../libs/tests/redis'
import { createRevenuecatSubscriptionSync } from '../../services/adapters/revenuecat-subscriptions'
import { createBillingService } from '../../services/domain/billing/billing-service'
import { ApiError } from '../../utils/error'
import { createRevenuecatRoutes } from './index'

import * as schema from '../../schemas'

const signingSecret = 'test-signing-secret'
const authorization = 'test-authorization-value'

const starterPlans: ConfigDefinitions['REVENUECAT_SUBSCRIPTION_PLANS'] = {
  rc_go_monthly: { entitlementId: 'airi_go', quotaCredit: 2000 },
  rc_plus_monthly: { entitlementId: 'airi_plus', quotaCredit: 5000 },
}

function createPlansConfigKV(): ConfigKVService {
  return {
    getOptional: vi.fn(async (key: string) => key === 'REVENUECAT_SUBSCRIPTION_PLANS' ? starterPlans : null),
    getOrThrow: vi.fn(),
    get: vi.fn(),
    refresh: vi.fn(),
    invalidateCache: vi.fn(),
  } as ConfigKVService
}

function signBody(rawBody: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const signature = createHmac('sha256', signingSecret).update(`${timestamp}.${rawBody}`).digest('hex')
  return `t=${timestamp},v1=${signature}`
}

function createTestApp(
  subscriptionSync: RevenuecatSubscriptionSync,
  env = { REVENUECAT_WEBHOOK_AUTH: authorization, REVENUECAT_WEBHOOK_SECRET: signingSecret },
) {
  const routes = createRevenuecatRoutes(subscriptionSync, env, null)
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

  app.route('/api/v1/revenuecat', routes)
  return app
}

function webhookBody(overrides = {}) {
  return {
    api_version: '1.0',
    event: { type: 'INITIAL_PURCHASE', id: 'sub-event-1', app_user_id: 'user-1', ...overrides },
  }
}

async function postWebhook(
  app: ReturnType<typeof createTestApp>,
  body: unknown,
  options: { authorization?: string | null, signature?: string | null } = {},
) {
  const rawBody = JSON.stringify(body)
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  const auth = options.authorization === undefined ? authorization : options.authorization
  const signature = options.signature === undefined ? signBody(rawBody) : options.signature
  if (auth)
    headers.authorization = auth
  if (signature)
    headers['x-revenuecat-webhook-signature'] = signature
  return app.request('/api/v1/revenuecat/webhook', { method: 'POST', headers, body: rawBody })
}

describe('revenuecat routes', () => {
  let db: Database

  beforeAll(async () => {
    db = await mockDB(schema)
  })

  /** What RevenueCat reports for each user. A test changes it between webhooks. */
  let entitlements: Record<string, SubscriberEntitlement[]>

  async function setup() {
    const configKV = createPlansConfigKV()
    await db.delete(schema.fluxUsage)
    await db.delete(schema.fluxTransaction)
    await db.delete(schema.userFlux)
    entitlements = {}
    const billing = createBillingService(db, createTestRedis(), { getOptional: async () => null })
    const fetchEntitlements = vi.fn(async (userId: string) => entitlements[userId] ?? [])
    const sync = createRevenuecatSubscriptionSync(billing, configKV, { fetchEntitlements })
    return { billing, fetchEntitlements, app: createTestApp(sync) }
  }

  async function readWallet(userId: string) {
    const [wallet] = await db.select().from(schema.userFlux).where(eq(schema.userFlux.userId, userId))
    return wallet
  }

  const goEntitlement: SubscriberEntitlement = {
    entitlementId: 'airi_go',
    productId: 'rc_go_monthly',
    purchasedAt: new Date('2026-10-01T00:00:00.000Z'),
    accessUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  }

  it('returns 401 on authorization mismatch', async () => {
    const { app } = await setup()
    const res = await postWebhook(app, webhookBody(), { authorization: 'wrong' })
    expect(res.status).toBe(401)
  })

  it('returns 401 on signature mismatch', async () => {
    const { app } = await setup()
    const res = await postWebhook(app, webhookBody(), { signature: 't=123,v1=deadbeef' })
    expect(res.status).toBe(401)
  })

  it('returns 401 on a signature that is older than the tolerance', async () => {
    const { app } = await setup()
    const body = webhookBody()
    const stale = signBody(JSON.stringify(body), Math.floor(Date.now() / 1000) - 600)

    const res = await postWebhook(app, body, { signature: stale })
    expect(res.status).toBe(401)
  })

  it('grants plan Flux from what RevenueCat reports', async () => {
    const { app } = await setup()
    entitlements['user-1'] = [goEntitlement]

    const res = await postWebhook(app, webhookBody())
    expect(res.status).toBe(200)

    expect(await readWallet('user-1')).toMatchObject({ flux: 0, planFlux: 2000, planQuota: 2000 })
  })

  it('does not grant again on a repeated or later event of the same period', async () => {
    const { billing, app } = await setup()
    entitlements['user-1'] = [goEntitlement]

    await postWebhook(app, webhookBody())
    await billing.postFluxUsage({ userId: 'user-1', source: { type: 'test', id: 'req-1' }, amountMicroFlux: 500_000_000 })
    await postWebhook(app, webhookBody())
    await postWebhook(app, webhookBody({ id: 'sub-event-2', type: 'CANCELLATION' }))

    expect(await readWallet('user-1')).toMatchObject({ planFlux: 1500, planQuota: 2000 })
  })

  it('grants the new plan on PRODUCT_CHANGE and not the old product in the event', async () => {
    const { app } = await setup()
    entitlements['user-1'] = [goEntitlement]
    await postWebhook(app, webhookBody())

    entitlements['user-1'] = [{
      entitlementId: 'airi_plus',
      productId: 'rc_plus_monthly',
      purchasedAt: new Date('2026-10-15T00:00:00.000Z'),
      accessUntil: goEntitlement.accessUntil,
    }]
    await postWebhook(app, webhookBody({ id: 'sub-event-2', type: 'PRODUCT_CHANGE', product_id: 'rc_go_monthly' }))

    expect(await readWallet('user-1')).toMatchObject({ planFlux: 5000, planQuota: 5000 })
  })

  it('expires the plan when RevenueCat reports no active plan', async () => {
    const { app } = await setup()
    entitlements['user-1'] = [goEntitlement]
    await postWebhook(app, webhookBody())

    entitlements['user-1'] = []
    await postWebhook(app, webhookBody({ id: 'sub-event-2', type: 'EXPIRATION' }))

    expect((await readWallet('user-1'))!.planExpiresAt!.getTime()).toBeLessThanOrEqual(Date.now())
  })

  it('reconciles both users of a TRANSFER', async () => {
    const { app } = await setup()
    entitlements['user-1'] = [goEntitlement]
    await postWebhook(app, webhookBody())

    entitlements['user-1'] = []
    entitlements['user-2'] = [goEntitlement]
    const res = await postWebhook(app, {
      api_version: '1.0',
      event: { type: 'TRANSFER', id: 'transfer-1', transferred_from: ['user-1'], transferred_to: ['user-2'] },
    })

    expect(res.status).toBe(200)
    expect((await readWallet('user-1'))!.planExpiresAt!.getTime()).toBeLessThanOrEqual(Date.now())
    expect(await readWallet('user-2')).toMatchObject({ planFlux: 2000 })
  })

  it('returns an error when RevenueCat cannot be read, so the event is sent again', async () => {
    const { fetchEntitlements, app } = await setup()
    fetchEntitlements.mockRejectedValueOnce(new ApiError(502, 'BAD_GATEWAY', 'RevenueCat subscriber request failed'))

    const res = await postWebhook(app, webhookBody())
    expect(res.status).toBe(502)
  })

  it('does not read RevenueCat for a TEST event', async () => {
    const { fetchEntitlements, app } = await setup()

    const res = await postWebhook(app, webhookBody({ type: 'TEST' }))
    expect(res.status).toBe(200)
    expect(fetchEntitlements).not.toHaveBeenCalled()
  })

  it('returns 503 when no secret is configured', async () => {
    const app = createTestApp(
      {} as RevenuecatSubscriptionSync,
      { REVENUECAT_WEBHOOK_AUTH: undefined, REVENUECAT_WEBHOOK_SECRET: undefined } as never,
    )
    const res = await app.request('/api/v1/revenuecat/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(webhookBody()),
    })
    expect(res.status).toBe(503)
  })
})
