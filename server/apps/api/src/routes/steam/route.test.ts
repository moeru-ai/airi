import type { Database } from '../../libs/db'
import type { ConfigKVService } from '../../services/adapters/config-kv'
import type { PaymentService } from '../../services/domain/payment'
import type { HonoEnv } from '../../types/hono'
import type { SteamMicroTxnClient } from './client'

import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { createTestRedis } from '../../libs/tests/redis'
import { createBillingService } from '../../services/domain/billing/billing-service'
import { createPaymentService } from '../../services/domain/payment'
import { ApiError } from '../../utils/error'
import { STEAM_TXN_NOT_APPROVED } from './client'
import { createSteamRoutes } from './index'

import * as schema from '../../schemas'

const testUser = {
  id: 'user-1',
  name: 'Test User',
  email: 'test@example.com',
}

const linkedSteamId = '76561198000000001'

const starterPack = {
  key: 'starter',
  name: '500 Flux',
  fluxAmount: 500,
  recommended: false,
  processors: {
    stripe: { priceId: 'price_starter' },
    steam: { itemId: 1001, amount: 499, currency: 'usd' },
  },
}

const stripeOnlyPack = {
  key: 'stripe-only',
  name: 'Stripe only',
  fluxAmount: 100,
  recommended: false,
  processors: { stripe: { priceId: 'price_other' } },
}

function createMockPayment(): PaymentService {
  return {
    openPending: vi.fn(async () => ({ id: 'po_mock' })),
    bindProcessorOrder: vi.fn(async () => {}),
    abandon: vi.fn(async () => {}),
    settle: vi.fn(async () => ({ applied: true, userId: 'user-1', fluxAmount: 500, balanceAfter: 500 })),
    deleteAllForUser: vi.fn(),
  }
}

function createLivePayment(db: Database) {
  const redis = createTestRedis()
  const billing = createBillingService(db, redis, createMockConfigKV())
  return createPaymentService(db, billing)
}

function createMockClient(): SteamMicroTxnClient {
  return {
    initTxn: vi.fn(async () => ({ steamUrl: 'https://store.steampowered.com/checkout/approvetxn/1' })),
    finalizeTxn: vi.fn(async () => ({ transId: 't1' })),
  }
}

function createMockConfigKV(): ConfigKVService {
  return {
    getOptional: vi.fn(async (key: string) => {
      if (key === 'FLUX_PACKS')
        return [starterPack, stripeOnlyPack]
      return null
    }),
    getOrThrow: vi.fn(),
    get: vi.fn(),
    refresh: vi.fn(),
    invalidateCache: vi.fn(),
  } as ConfigKVService
}

const testEnv = {
  WEB_APP_URL: 'https://airi.moeru.ai',
  ADDITIONAL_TRUSTED_ORIGINS: [],
}

function createTestApp(
  payment: PaymentService,
  client: SteamMicroTxnClient | null,
  db: Database,
) {
  const routes = createSteamRoutes(payment, db, client, createMockConfigKV(), testEnv, null)
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
      c.set('user', user as HonoEnv['Variables']['user'])
    await next()
  })

  app.route('/api/v1/steam', routes)
  return app
}

function authedJson(app: ReturnType<typeof createTestApp>, path: string, body: unknown) {
  return app.fetch(
    new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.10',
      },
      body: JSON.stringify(body),
    }),
    { user: testUser } as never,
  )
}

describe('steam routes', () => {
  let db: Database
  let payment: PaymentService
  let client: SteamMicroTxnClient

  beforeAll(async () => {
    db = await mockDB(schema)
    await db.insert(schema.user).values({
      id: testUser.id,
      name: testUser.name,
      email: testUser.email,
    })
    await db.insert(schema.account).values({
      id: 'acc-steam-1',
      accountId: linkedSteamId,
      providerId: 'steam',
      userId: testUser.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await db.insert(schema.user).values({
      id: 'user-unlinked',
      name: 'Unlinked',
      email: 'unlinked@example.com',
    })
  })

  beforeEach(async () => {
    payment = createMockPayment()
    client = createMockClient()
    await db.delete(schema.paymentOrder).where(eq(schema.paymentOrder.userId, testUser.id))
  })

  it('returns 503 when checkout runs without a Steam client', async () => {
    const app = createTestApp(payment, null, db)
    const res = await authedJson(app, '/api/v1/steam/checkout', { packKey: 'starter' })
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ error: 'STEAM_MICROTXN_DISABLED' })
  })

  it('lists only packs that have a Steam mapping', async () => {
    const app = createTestApp(payment, client, db)
    const res = await app.request('/api/v1/steam/packages')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([{
      packKey: 'starter',
      label: '500 Flux',
      defaultCurrency: 'usd',
      currencies: { usd: '$4.99' },
      recommended: false,
    }])
  })

  it('returns 400 when checkout has no linked Steam account', async () => {
    const app = createTestApp(payment, client, db)
    const res = await app.fetch(
      new Request('http://localhost/api/v1/steam/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ packKey: 'starter' }),
      }),
      { user: { id: 'user-unlinked', name: 'Unlinked', email: 'unlinked@example.com' } } as never,
    )
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'STEAM_ACCOUNT_NOT_LINKED' })
    expect(client.initTxn).not.toHaveBeenCalled()
  })

  it('inserts a pending order then calls InitTxn', async () => {
    const app = createTestApp(createLivePayment(db), client, db)
    const res = await authedJson(app, '/api/v1/steam/checkout', { packKey: 'starter' })
    expect(res.status).toBe(200)
    const body = await res.json() as { orderId: string, url: string }
    expect(body.orderId).toMatch(/^\d+$/)
    expect(body.url).toContain('https://store.steampowered.com/checkout/approvetxn/1')
    expect(new URL(body.url).searchParams.get('returnurl')).toBe(
      `https://airi.moeru.ai/settings/flux?steam_order=${body.orderId}`,
    )

    const [order] = await db.select().from(schema.paymentOrder).where(eq(schema.paymentOrder.userId, testUser.id))
    expect(order?.status).toBe('pending')
    expect(order?.processor).toBe('steam')
    expect(order?.processorOrderId).toBe(body.orderId)
    expect(order?.packKey).toBe('starter')
    expect(order?.fluxAmount).toBe(500)
    expect(order?.amount).toBe(499)
    expect(order?.currency).toBe('usd')

    expect(client.initTxn).toHaveBeenCalledWith({
      orderId: body.orderId,
      steamId: linkedSteamId,
      itemId: 1001,
      amount: 499,
      currency: 'usd',
      description: '500 Flux',
      ipAddress: '203.0.113.10',
    })
  })

  it('abandons the pending order when InitTxn fails', async () => {
    vi.mocked(client.initTxn).mockRejectedValueOnce(new Error('steam down'))
    const app = createTestApp(createLivePayment(db), client, db)

    const res = await authedJson(app, '/api/v1/steam/checkout', { packKey: 'starter' })
    expect(res.status).toBe(500)

    const [order] = await db.select().from(schema.paymentOrder).where(eq(schema.paymentOrder.userId, testUser.id))
    expect(order?.status).toBe('canceled')
    expect(order?.processorOrderId).toBeNull()
  })

  it('settles a paid claim after FinalizeTxn succeeds', async () => {
    const [order] = await db.insert(schema.paymentOrder).values({
      userId: testUser.id,
      processor: 'steam',
      processorOrderId: '9001',
      status: 'pending',
      packKey: 'starter',
      fluxAmount: 500,
      amount: 499,
      currency: 'usd',
    }).returning()

    const app = createTestApp(payment, client, db)
    const res = await authedJson(app, '/api/v1/steam/finalize', { orderId: '9001' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'paid' })
    expect(client.finalizeTxn).toHaveBeenCalledWith({ orderId: '9001' })
    expect(payment.settle).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'claim',
      processor: 'steam',
      paymentOrderId: order!.id,
      processorOrderId: '9001',
      status: 'paid',
      customerId: linkedSteamId,
    }))
  })

  it('returns 409 when Steam says the transaction is not approved yet', async () => {
    await db.insert(schema.paymentOrder).values({
      userId: testUser.id,
      processor: 'steam',
      processorOrderId: '9002',
      status: 'pending',
      packKey: 'starter',
      fluxAmount: 500,
    })
    vi.mocked(client.finalizeTxn).mockRejectedValueOnce(
      new ApiError(409, STEAM_TXN_NOT_APPROVED, 'Steam transaction is not approved yet'),
    )

    const app = createTestApp(payment, client, db)
    const res = await authedJson(app, '/api/v1/steam/finalize', { orderId: '9002' })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: STEAM_TXN_NOT_APPROVED })
    expect(payment.settle).not.toHaveBeenCalled()

    const [order] = await db.select().from(schema.paymentOrder).where(eq(schema.paymentOrder.processorOrderId, '9002'))
    expect(order?.status).toBe('pending')
  })

  it('does not call FinalizeTxn again for a paid order', async () => {
    await db.insert(schema.paymentOrder).values({
      userId: testUser.id,
      processor: 'steam',
      processorOrderId: '9003',
      status: 'paid',
      packKey: 'starter',
      fluxAmount: 500,
    })

    const app = createTestApp(payment, client, db)
    const res = await authedJson(app, '/api/v1/steam/finalize', { orderId: '9003' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'paid' })
    expect(client.finalizeTxn).not.toHaveBeenCalled()
    expect(payment.settle).not.toHaveBeenCalled()
  })
})
