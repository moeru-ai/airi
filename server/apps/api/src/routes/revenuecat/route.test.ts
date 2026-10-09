import type { Database } from '../../libs/db'
import type { ConfigDefinitions, ConfigKVService } from '../../services/adapters/config-kv'
import type { SubscriberEntitlement } from '../../services/adapters/revenuecat-subscriber'
import type { RevenuecatSubscriptionSync } from '../../services/adapters/revenuecat-subscriptions'
import type { PaymentService } from '../../services/domain/payment'
import type { HonoEnv } from '../../types/hono'

import { createHmac } from 'node:crypto'

import { Hono } from 'hono'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { createRevenuecatSubscriptionSync } from '../../services/adapters/revenuecat-subscriptions'
import { createSubscriptionService } from '../../services/domain/subscriptions'
import { ApiError } from '../../utils/error'
import { createRevenuecatRoutes } from './index'

import * as schema from '../../schemas'

const signingSecret = 'test-signing-secret'
const authorization = 'test-authorization-value'

const starterPacks: ConfigDefinitions['REVENUECAT_FLUX_PACKS'] = {
  flux_500: { fluxAmount: 500 },
}

const starterPlans: ConfigDefinitions['REVENUECAT_SUBSCRIPTION_PLANS'] = {
  rc_go_monthly: { entitlementId: 'airi_go', quotaCredit: 2000 },
  rc_plus_monthly: { entitlementId: 'airi_plus', quotaCredit: 5000 },
}

function createPacksConfigKV(
  packs: ConfigDefinitions['REVENUECAT_FLUX_PACKS'] = starterPacks,
  plans: ConfigDefinitions['REVENUECAT_SUBSCRIPTION_PLANS'] = starterPlans,
): ConfigKVService {
  return {
    getOptional: vi.fn(async (key: string) => {
      if (key === 'REVENUECAT_FLUX_PACKS')
        return packs
      if (key === 'REVENUECAT_SUBSCRIPTION_PLANS')
        return plans
      return null
    }),
    getOrThrow: vi.fn(),
    get: vi.fn(),
    refresh: vi.fn(),
    invalidateCache: vi.fn(),
  } as ConfigKVService
}

function createMockPayment(overrides?: Partial<PaymentService>): PaymentService {
  return {
    openPending: vi.fn(),
    bindProcessorOrder: vi.fn(),
    abandon: vi.fn(),
    settle: vi.fn(async () => ({ applied: true, userId: 'user-1', fluxAmount: 500, balanceAfter: 500 })),
    deleteAllForUser: vi.fn(),
    ...overrides,
  }
}

function signBody(rawBody: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const signature = createHmac('sha256', signingSecret).update(`${timestamp}.${rawBody}`).digest('hex')
  return `t=${timestamp},v1=${signature}`
}

function createTestApp(
  payment: PaymentService,
  configKV: ConfigKVService = createPacksConfigKV(),
  subscriptionSync: RevenuecatSubscriptionSync,
  env = { REVENUECAT_WEBHOOK_AUTH: authorization, REVENUECAT_WEBHOOK_SECRET: signingSecret },
) {
  const routes = createRevenuecatRoutes(payment, configKV, subscriptionSync, env, null)
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
    event: {
      type: 'NON_RENEWING_PURCHASE',
      id: 'event-1',
      app_user_id: 'user-1',
      product_id: 'flux_500',
      transaction_id: 'txn-1',
      environment: 'SANDBOX',
      store: 'TEST_STORE',
      ...overrides,
    },
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
    headers['x-revenuecat-signature'] = signature
  return app.request('/api/v1/revenuecat/webhook', { method: 'POST', headers, body: rawBody })
}

describe('revenuecat routes', () => {
  let db: Database

  beforeAll(async () => {
    db = await mockDB(schema)
  })

  /** What RevenueCat reports for each user. A test changes it between webhooks. */
  let entitlements: Record<string, SubscriberEntitlement[]>

  async function setup(configKV: ConfigKVService = createPacksConfigKV()) {
    await db.delete(schema.subscriptionConsumption)
    await db.delete(schema.subscriptionAllowance)
    entitlements = {}
    const payment = createMockPayment()
    const subscriptions = createSubscriptionService(db)
    const fetchEntitlements = vi.fn(async (userId: string) => entitlements[userId] ?? [])
    const sync = createRevenuecatSubscriptionSync(subscriptions, configKV, { fetchEntitlements })
    return {
      payment,
      subscriptions,
      fetchEntitlements,
      app: createTestApp(payment, configKV, sync),
    }
  }

  const goEntitlement: SubscriberEntitlement = {
    entitlementId: 'airi_go',
    productId: 'rc_go_monthly',
    purchasedAt: new Date('2026-10-01T00:00:00.000Z'),
    accessUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  }

  function subscriptionBody(overrides = {}) {
    return {
      api_version: '1.0',
      event: {
        type: 'INITIAL_PURCHASE',
        id: 'sub-event-1',
        app_user_id: 'user-1',
        product_id: 'rc_go_monthly',
        environment: 'SANDBOX',
        store: 'TEST_STORE',
        ...overrides,
      },
    }
  }

  it('settles a non-renewing purchase as revenuecat evidence', async () => {
    const { payment, app } = await setup()

    const res = await postWebhook(app, webhookBody())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ received: true, granted: true })
    expect(payment.settle).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'evidence',
      processor: 'revenuecat',
      processorOrderId: 'txn-1',
      userId: 'user-1',
      packKey: 'flux_500',
      fluxAmount: 500,
    }))
  })

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

  it('acks unknown products without a grant', async () => {
    const { payment, app } = await setup()

    const res = await postWebhook(app, webhookBody({ product_id: 'unknown', id: 'event-2' }))
    expect(res.status).toBe(200)
    expect(payment.settle).not.toHaveBeenCalled()
  })

  it('grants plan Credits from what RevenueCat reports', async () => {
    const { payment, subscriptions, app } = await setup()
    entitlements['user-1'] = [goEntitlement]

    const res = await postWebhook(app, subscriptionBody())
    expect(res.status).toBe(200)
    expect(payment.settle).not.toHaveBeenCalled()

    const status = await subscriptions.getStatus('user-1')
    expect(status.allowances).toMatchObject([{ entitlementId: 'airi_go', grantedCredit: 2000, usedCredit: 0 }])
  })

  it('does not grant again on a repeated or later event of the same period', async () => {
    const { subscriptions, app } = await setup()
    entitlements['user-1'] = [goEntitlement]

    await postWebhook(app, subscriptionBody())
    await subscriptions.debitCredits({ userId: 'user-1', microCredit: 500_000_000, requestId: 'req-1' })
    await postWebhook(app, subscriptionBody())
    await postWebhook(app, subscriptionBody({ id: 'sub-event-2', type: 'CANCELLATION' }))

    const status = await subscriptions.getStatus('user-1')
    expect(status.allowances).toMatchObject([{ grantedCredit: 2000, usedCredit: 500 }])
  })

  it('grants the new plan on PRODUCT_CHANGE and not the old product in the event', async () => {
    const { subscriptions, app } = await setup()
    entitlements['user-1'] = [goEntitlement]
    await postWebhook(app, subscriptionBody())

    entitlements['user-1'] = [{
      entitlementId: 'airi_plus',
      productId: 'rc_plus_monthly',
      purchasedAt: new Date('2026-10-15T00:00:00.000Z'),
      accessUntil: goEntitlement.accessUntil,
    }]
    await postWebhook(app, subscriptionBody({ id: 'sub-event-2', type: 'PRODUCT_CHANGE', product_id: 'rc_go_monthly' }))

    const status = await subscriptions.getStatus('user-1')
    expect(status.allowances).toMatchObject([{ entitlementId: 'airi_plus', grantedCredit: 5000, usedCredit: 0 }])
  })

  it('closes plan Credits when RevenueCat reports no active plan', async () => {
    const { subscriptions, app } = await setup()
    entitlements['user-1'] = [goEntitlement]
    await postWebhook(app, subscriptionBody())

    entitlements['user-1'] = []
    await postWebhook(app, subscriptionBody({ id: 'sub-event-2', type: 'EXPIRATION' }))

    expect(await subscriptions.spendableMicro('user-1')).toBe(0)
  })

  it('reconciles both users of a TRANSFER', async () => {
    const { subscriptions, app } = await setup()
    entitlements['user-1'] = [goEntitlement]
    await postWebhook(app, subscriptionBody())

    entitlements['user-1'] = []
    entitlements['user-2'] = [goEntitlement]
    const res = await postWebhook(app, {
      api_version: '1.0',
      event: { type: 'TRANSFER', id: 'transfer-1', transferred_from: ['user-1'], transferred_to: ['user-2'] },
    })

    expect(res.status).toBe(200)
    expect(await subscriptions.spendableMicro('user-1')).toBe(0)
    expect((await subscriptions.getStatus('user-2')).allowances).toMatchObject([{ grantedCredit: 2000 }])
  })

  it('returns an error when RevenueCat cannot be read, so the event is sent again', async () => {
    const { fetchEntitlements, app } = await setup()
    fetchEntitlements.mockRejectedValueOnce(new ApiError(502, 'BAD_GATEWAY', 'RevenueCat subscriber request failed'))

    const res = await postWebhook(app, subscriptionBody())
    expect(res.status).toBe(502)
  })

  it('does not read RevenueCat for a TEST event', async () => {
    const { fetchEntitlements, app } = await setup()

    const res = await postWebhook(app, subscriptionBody({ type: 'TEST' }))
    expect(res.status).toBe(200)
    expect(fetchEntitlements).not.toHaveBeenCalled()
  })

  it('returns 503 when no secret is configured', async () => {
    const payment = createMockPayment()
    const app = createTestApp(
      payment,
      createPacksConfigKV(),
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

  it('lists flux packs on GET /packages', async () => {
    const { app } = await setup()
    const res = await app.request('/api/v1/revenuecat/packages')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([{ productId: 'flux_500', fluxAmount: 500 }])
  })
})
