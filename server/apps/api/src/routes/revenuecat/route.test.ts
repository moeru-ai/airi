import type Redis from 'ioredis'

import type { Database } from '../../libs/db'
import type { ConfigDefinitions, ConfigKVService } from '../../services/adapters/config-kv'
import type { SubscriberEntitlement } from '../../services/adapters/revenuecat-subscriber'
import type { RevenuecatSubscriptionSync } from '../../services/adapters/revenuecat-subscriptions'
import type { HonoEnv } from '../../types/hono'

import { createHmac } from 'node:crypto'

import { ApiError } from '@proj-airi/http-error-shared'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { createStreamPublisher } from '../../libs/redis/stream'
import { createTestRedis, readStreamFields } from '../../libs/tests/redis'
import { accountEventsStream } from '../../services/adapters/account-events'
import { createConfigKVService } from '../../services/adapters/config-kv'
import { createRevenuecatSubscriberClient } from '../../services/adapters/revenuecat-subscriber'
import { createRevenuecatSubscriptionSync } from '../../services/adapters/revenuecat-subscriptions'
import { createBillingService } from '../../services/domain/billing/billing-service'
import { createRevenuecatRoutes } from './index'

import * as schema from '../../schemas'

const signingSecret = 'test-signing-secret'
const authorization = 'test-authorization-value'

const starterCapacitors: ConfigDefinitions['REVENUECAT_CAPACITORS'] = {
  rc_go_monthly: { entitlementId: 'airi_go', quota: 2000 },
  rc_plus_monthly: { entitlementId: 'airi_plus', quota: 5000 },
}

function createCapacitorsConfigKV(resetInterval: ConfigDefinitions['CAPACITOR_RESET_INTERVAL'] | null = null): ConfigKVService {
  const values = new Map([['REVENUECAT_CAPACITORS', JSON.stringify(starterCapacitors)]])
  if (resetInterval)
    values.set('CAPACITOR_RESET_INTERVAL', JSON.stringify(resetInterval))
  return createConfigKVService({
    getRaw: vi.fn(async key => values.get(key) ?? null),
    getFreshRaw: vi.fn(async key => values.get(key) ?? null),
    invalidateCache: vi.fn(async () => {}),
  })
}

function signBody(rawBody: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const signature = createHmac('sha256', signingSecret).update(`${timestamp}.${rawBody}`).digest('hex')
  return `t=${timestamp},v1=${signature}`
}

/** A production deployment that also grants the sandbox purchases of `tester`. */
const subscriber = createRevenuecatSubscriberClient({
  apiKey: null,
  projectId: null,
  environment: 'production',
  sandboxUserIds: ['tester'],
  sellsSubscriptions: true,
})

function createTestApp(
  subscriptionSync: RevenuecatSubscriptionSync,
  env = { REVENUECAT_WEBHOOK_AUTH: authorization, REVENUECAT_WEBHOOK_SECRET: signingSecret },
  /** The signed-in user of each request. Null leaves the request anonymous, as RevenueCat sends it. */
  signedInUserId: string | null = null,
  redis: Redis = createTestRedis(),
) {
  const routes = createRevenuecatRoutes(subscriptionSync, createStreamPublisher(redis, accountEventsStream), subscriber, env, null)
  const app = new Hono<HonoEnv>()

  app.use('*', async (c, next) => {
    c.set('user', signedInUserId ? { id: signedInUserId, name: 'Test User', email: 'test@example.com', emailVerified: true, createdAt: new Date(), updatedAt: new Date() } : null)
    await next()
  })

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

  async function setup(
    signedInUserId: string | null = null,
    resetInterval: ConfigDefinitions['CAPACITOR_RESET_INTERVAL'] | null = null,
  ) {
    const configKV = createCapacitorsConfigKV(resetInterval)
    await db.delete(schema.fluxUsage)
    await db.delete(schema.fluxTransaction)
    await db.delete(schema.userFlux)
    entitlements = {}
    const billing = createBillingService(db, createTestRedis(), { getOptional: async () => null })
    const fetchEntitlements = vi.fn(async (userId: string) => entitlements[userId] ?? [])
    const sync = createRevenuecatSubscriptionSync(billing, configKV, { fetchEntitlements })
    const redis = createTestRedis()
    return { billing, fetchEntitlements, redis, app: createTestApp(sync, undefined, signedInUserId, redis) }
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

  it('accepts a signed webhook after many unsigned requests', async () => {
    const { app } = await setup()
    entitlements['user-1'] = [goEntitlement]

    for (let attempt = 0; attempt < 61; attempt++)
      await postWebhook(app, webhookBody(), { authorization: 'wrong' })

    const res = await postWebhook(app, webhookBody())
    expect(res.status).toBe(200)
  })

  it('grants capacitor Flux from what RevenueCat reports', async () => {
    const { app } = await setup()
    entitlements['user-1'] = [goEntitlement]

    const res = await postWebhook(app, webhookBody())
    expect(res.status).toBe(200)

    expect(await readWallet('user-1')).toMatchObject({ flux: 0, capacitorFlux: 2000, capacitorQuota: 2000 })
  })

  it('does not grant again on a repeated or later event of the same period', async () => {
    const { billing, app } = await setup()
    entitlements['user-1'] = [goEntitlement]

    await postWebhook(app, webhookBody())
    await billing.postFluxUsage({ userId: 'user-1', source: { type: 'test', id: 'req-1' }, amountMicroFlux: 500_000_000 })
    await postWebhook(app, webhookBody())
    await postWebhook(app, webhookBody({ id: 'sub-event-2', type: 'CANCELLATION' }))

    expect(await readWallet('user-1')).toMatchObject({ capacitorFlux: 1500, capacitorQuota: 2000 })
  })

  // https://github.com/moeru-ai/airi/issues/2981
  // A refill needs a last refill earlier than the new period start, so the clock moves from the first event to the upgrade.
  it('grants the new capacitor on PRODUCT_CHANGE and not the old product in the event', async () => {
    const upgradedAt = new Date('2026-10-15T00:00:00.000Z')
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-02T00:00:00.000Z') })
    try {
      const { app } = await setup()
      entitlements['user-1'] = [goEntitlement]
      await postWebhook(app, webhookBody())

      vi.setSystemTime(upgradedAt)
      entitlements['user-1'] = [{
        entitlementId: 'airi_plus',
        productId: 'rc_plus_monthly',
        purchasedAt: upgradedAt,
        accessUntil: goEntitlement.accessUntil,
      }]
      await postWebhook(app, webhookBody({ id: 'sub-event-2', type: 'PRODUCT_CHANGE', product_id: 'rc_go_monthly' }))

      expect(await readWallet('user-1')).toMatchObject({ capacitorFlux: 5000, capacitorQuota: 5000 })
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('expires the capacitor when RevenueCat reports no active capacitor', async () => {
    const { app } = await setup()
    entitlements['user-1'] = [goEntitlement]
    await postWebhook(app, webhookBody())

    entitlements['user-1'] = []
    await postWebhook(app, webhookBody({ id: 'sub-event-2', type: 'EXPIRATION' }))

    expect((await readWallet('user-1'))!.capacitorExpiresAt!.getTime()).toBeLessThanOrEqual(Date.now())
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
    expect((await readWallet('user-1'))!.capacitorExpiresAt!.getTime()).toBeLessThanOrEqual(Date.now())
    expect(await readWallet('user-2')).toMatchObject({ capacitorFlux: 2000 })
  })

  it('returns an error when RevenueCat cannot be read, so the event is sent again', async () => {
    const { fetchEntitlements, app } = await setup()
    fetchEntitlements.mockRejectedValueOnce(new ApiError(502, 'BAD_GATEWAY', 'RevenueCat subscriber request failed'))

    const res = await postWebhook(app, webhookBody())
    expect(res.status).toBe(502)
  })

  describe('account events', () => {
    const renewal = {
      type: 'RENEWAL',
      id: 'renewal-1',
      app_user_id: 'user-1',
      product_id: 'rc_go_monthly',
      environment: 'PRODUCTION',
      event_timestamp_ms: Date.parse('2026-10-18T00:00:00.000Z'),
      expiration_at_ms: Date.parse('2026-11-18T00:00:00.000Z'),
    }
    const billingIssue = {
      type: 'BILLING_ISSUE',
      id: 'billing-issue-1',
      app_user_id: 'user-1',
      product_id: 'rc_go_monthly',
      environment: 'PRODUCTION',
      event_timestamp_ms: Date.parse('2026-10-18T00:00:00.000Z'),
      grace_period_expiration_at_ms: Date.parse('2026-10-25T00:00:00.000Z'),
    }

    it('publishes subscription.renewed once after the reconciliation', async () => {
      const { app, redis } = await setup()
      entitlements['user-1'] = [goEntitlement]

      const res = await postWebhook(app, webhookBody(renewal))

      expect(res.status).toBe(200)
      expect(await readWallet('user-1')).toMatchObject({ capacitorFlux: 2000 })
      expect(await readStreamFields(redis, 'account-events')).toEqual([{
        id: 'revenuecat:renewal-1',
        type: 'subscription.renewed',
        version: '1',
        occurredAt: '2026-10-18T00:00:00.000Z',
        payload: '{"userId":"user-1","plan":"rc_go_monthly","periodEnd":"2026-11-18T00:00:00.000Z"}',
      }])
    })

    it('publishes subscription.payment_failed once for BILLING_ISSUE', async () => {
      const { app, redis } = await setup()

      const res = await postWebhook(app, webhookBody(billingIssue))

      expect(res.status).toBe(200)
      expect(await readStreamFields(redis, 'account-events')).toEqual([{
        id: 'revenuecat:billing-issue-1',
        type: 'subscription.payment_failed',
        version: '1',
        occurredAt: '2026-10-18T00:00:00.000Z',
        payload: '{"userId":"user-1","plan":"rc_go_monthly"}',
      }])
    })

    it('returns 500 when the publish fails, so RevenueCat sends the event again', async () => {
      const { app, redis } = await setup()
      entitlements['user-1'] = [goEntitlement]
      vi.spyOn(redis, 'xadd').mockRejectedValueOnce(new Error('Connection is closed.'))

      const failed = await postWebhook(app, webhookBody(renewal))
      expect(failed.status).toBe(500)
      expect(await readWallet('user-1')).toMatchObject({ capacitorFlux: 2000 })

      const retried = await postWebhook(app, webhookBody(renewal))
      expect(retried.status).toBe(200)
      expect(await readWallet('user-1')).toMatchObject({ capacitorFlux: 2000, capacitorQuota: 2000 })
      expect((await readStreamFields(redis, 'account-events')).map(event => event.id)).toEqual(['revenuecat:renewal-1'])
    })

    it('returns 500 when the BILLING_ISSUE publish fails', async () => {
      const { app, redis } = await setup()
      vi.spyOn(redis, 'xadd').mockRejectedValueOnce(new Error('Connection is closed.'))

      const res = await postWebhook(app, webhookBody(billingIssue))

      expect(res.status).toBe(500)
    })

    it('publishes nothing for an event type without a notification', async () => {
      const { app, redis } = await setup()
      entitlements['user-1'] = [goEntitlement]

      const res = await postWebhook(app, webhookBody())

      expect(res.status).toBe(200)
      expect(await readStreamFields(redis, 'account-events')).toEqual([])
    })

    it('publishes nothing for a sandbox renewal of a production user', async () => {
      const { app, redis } = await setup()

      const res = await postWebhook(app, webhookBody({ ...renewal, environment: 'SANDBOX' }))

      expect(res.status).toBe(200)
      expect(await readStreamFields(redis, 'account-events')).toEqual([])
    })

    it('publishes a sandbox renewal of a listed test account', async () => {
      const { app, redis } = await setup()

      const res = await postWebhook(app, webhookBody({ ...renewal, app_user_id: 'tester', environment: 'SANDBOX' }))

      expect(res.status).toBe(200)
      expect((await readStreamFields(redis, 'account-events')).map(event => event.payload)).toEqual(['{"userId":"tester","plan":"rc_go_monthly","periodEnd":"2026-11-18T00:00:00.000Z"}'])
    })

    it('rejects a RENEWAL without its period end before the reconciliation', async () => {
      const { app, redis, fetchEntitlements } = await setup()
      const { expiration_at_ms: _, ...withoutPeriodEnd } = renewal

      const res = await postWebhook(app, webhookBody(withoutPeriodEnd))

      expect(res.status).toBe(400)
      expect(fetchEntitlements).not.toHaveBeenCalled()
      expect(await readStreamFields(redis, 'account-events')).toEqual([])
    })
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

  it('grants the Capacitor of the signed-in user on sync, without a webhook', async () => {
    const { fetchEntitlements, app } = await setup('user-1')
    entitlements['user-1'] = [goEntitlement]

    const res = await app.request('/api/v1/revenuecat/sync', { method: 'POST' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ synced: true })
    expect(fetchEntitlements).toHaveBeenCalledWith('user-1')
    expect(await readWallet('user-1')).toMatchObject({ capacitorFlux: 2000, capacitorQuota: 2000 })
  })

  it('rejects an anonymous sync', async () => {
    const { fetchEntitlements, app } = await setup()

    const res = await app.request('/api/v1/revenuecat/sync', { method: 'POST' })
    expect(res.status).toBe(401)
    expect(fetchEntitlements).not.toHaveBeenCalled()
  })

  // https://github.com/moeru-ai/airi/pull/3004#discussion_r4302304373
  // ROOT CAUSE:
  // The quota response replaced productIds, which existing clients read.
  // A separate catalog route keeps both read contracts available during release.
  it('preserves the product-ID response (Issue #3004)', async () => {
    const { app, fetchEntitlements } = await setup('user-1')

    const res = await app.request('/api/v1/revenuecat/capacitors')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ productIds: ['rc_go_monthly', 'rc_plus_monthly'] })
    expect(fetchEntitlements).not.toHaveBeenCalled()
  })

  it('lists product quotas with a renewal refill when no reset interval is configured', async () => {
    const { app } = await setup('user-1')

    const res = await app.request('/api/v1/revenuecat/catalog')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      capacitors: [
        { productId: 'rc_go_monthly', quota: 2000 },
        { productId: 'rc_plus_monthly', quota: 5000 },
      ],
      resetInterval: null,
    })
  })

  it('lists product quotas with the configured reset interval without reading RevenueCat', async () => {
    const { app, fetchEntitlements } = await setup('user-1', 'day')

    const res = await app.request('/api/v1/revenuecat/catalog')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      capacitors: [
        { productId: 'rc_go_monthly', quota: 2000 },
        { productId: 'rc_plus_monthly', quota: 5000 },
      ],
      resetInterval: 'day',
    })
    expect(fetchEntitlements).not.toHaveBeenCalled()
  })

  it('rejects an anonymous catalog request', async () => {
    const { app, fetchEntitlements } = await setup()

    const res = await app.request('/api/v1/revenuecat/catalog')
    expect(res.status).toBe(401)
    expect(fetchEntitlements).not.toHaveBeenCalled()
  })
})
