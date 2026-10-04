import type { Database } from '../../libs/db'
import type { ConfigDefinitions, ConfigKVService } from '../../services/adapters/config-kv'
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

  function setup(configKV: ConfigKVService = createPacksConfigKV()) {
    const payment = createMockPayment()
    const subscriptions = createSubscriptionService(db)
    const sync = createRevenuecatSubscriptionSync(subscriptions, configKV, null)
    return { payment, subscriptions, app: createTestApp(payment, configKV, sync) }
  }

  function subscriptionBody(overrides = {}) {
    return {
      api_version: '1.0',
      event: {
        type: 'INITIAL_PURCHASE',
        id: 'sub-event-1',
        app_user_id: 'user-1',
        product_id: 'rc_go_monthly',
        transaction_id: 'sub-txn-1',
        environment: 'SANDBOX',
        store: 'TEST_STORE',
        entitlement_ids: ['airi_go'],
        expiration_at_ms: Date.now() + 30 * 24 * 60 * 60 * 1000,
        purchased_at_ms: Date.now(),
        ...overrides,
      },
    }
  }

  it('settles a non-renewing purchase as revenuecat evidence', async () => {
    const { payment, app } = setup()

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
    const { app } = setup()
    const res = await postWebhook(app, webhookBody(), { authorization: 'wrong' })
    expect(res.status).toBe(401)
  })

  it('returns 401 on signature mismatch', async () => {
    const { app } = setup()
    const res = await postWebhook(app, webhookBody(), { signature: 't=123,v1=deadbeef' })
    expect(res.status).toBe(401)
  })

  it('acks unknown products without a grant', async () => {
    const { payment, app } = setup()

    const res = await postWebhook(app, webhookBody({ product_id: 'unknown', id: 'event-2' }))
    expect(res.status).toBe(200)
    expect(payment.settle).not.toHaveBeenCalled()
  })

  it('syncs a subscription purchase and opens a quota period', async () => {
    const { payment, subscriptions, app } = setup()

    const res = await postWebhook(app, subscriptionBody())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ received: true, synced: true })
    expect(payment.settle).not.toHaveBeenCalled()

    const status = await subscriptions.getStatus('user-1')
    expect(status.subscriptions).toMatchObject([{ entitlementId: 'airi_go', status: 'active' }])
    expect(status.allowances).toMatchObject([{ entitlementId: 'airi_go', grantedCredit: 2000, usedCredit: 0 }])
  })

  it('keeps access on cancellation until expiry, then revokes on expiration', async () => {
    const { subscriptions, app } = setup()
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000

    await postWebhook(app, subscriptionBody({ id: 'sub-event-2', expiration_at_ms: expiresAt }))
    await postWebhook(app, subscriptionBody({ id: 'sub-event-3', type: 'CANCELLATION', expiration_at_ms: expiresAt }))

    let status = await subscriptions.getStatus('user-1')
    expect(status.subscriptions).toMatchObject([{ entitlementId: 'airi_go', status: 'cancelled' }])

    await postWebhook(app, subscriptionBody({ id: 'sub-event-4', type: 'EXPIRATION', expiration_at_ms: Date.now() - 1000 }))
    status = await subscriptions.getStatus('user-1')
    expect(status.subscriptions).toEqual([])
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
    const { app } = setup()
    const res = await app.request('/api/v1/revenuecat/packages')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([{ productId: 'flux_500', fluxAmount: 500 }])
  })
})
