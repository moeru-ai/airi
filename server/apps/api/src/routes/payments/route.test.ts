import type { Database } from '../../libs/db'
import type { HonoEnv } from '../../types/hono'

import { useLogger } from '@guiiai/logg'
import { createErrorHandler } from '@proj-airi/http-error-shared'
import { Hono } from 'hono'
import { beforeAll, describe, expect, it } from 'vitest'

import { createPaymentRoutes } from '.'
import { mockDB } from '../../libs/mock-db'
import { paymentOrder } from '../../schemas/payment'
import { createPaymentReceiptAdapters } from '../../services/adapters/payment'
import { createPaymentReceiptService } from '../../services/domain/payment/receipt'

describe('payment routes', () => {
  let db: Database
  const adapters = createPaymentReceiptAdapters(null)

  beforeAll(async () => {
    db = await mockDB({ paymentOrder })
    await db.insert(paymentOrder).values([
      { id: 'apple-order', userId: 'buyer', processor: 'apple_iap', status: 'paid', createdAt: new Date('2026-11-01T00:00:00Z') },
      { id: 'stripe-order', userId: 'buyer', processor: 'stripe', status: 'paid', amount: 6000, currency: 'usd', fluxAmount: 2000, createdAt: new Date('2026-10-01T00:00:00Z'), creditedAt: new Date('2026-11-02T00:00:00Z') },
      { id: 'same-date-order', userId: 'buyer', processor: 'apple_iap', status: 'paid', amount: 0, currency: 'jpy', createdAt: new Date('2026-11-02T00:00:00Z') },
      { id: 'foreign-order', userId: 'another-buyer', processor: 'stripe', status: 'paid' },
      { id: 'pending-order', userId: 'buyer', processor: 'stripe', status: 'pending' },
      { id: 'deleted-order', userId: 'buyer', processor: 'stripe', status: 'paid', deletedAt: new Date() },
    ])
  })

  function createApp(userId: string | null) {
    const app = new Hono<HonoEnv>()
    app.onError(createErrorHandler(useLogger('payment-receipt-test')))
    app.use('*', async (c, next) => {
      c.set('user', userId === null
        ? null
        : {
            id: userId,
            name: 'Buyer',
            email: 'buyer@example.com',
            emailVerified: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
      await next()
    })
    app.route('/api/v1/payments', createPaymentRoutes(createPaymentReceiptService(db, adapters)))
    return app
  }

  it('returns an owned order destination as a private resource', async () => {
    const response = await createApp('buyer').request('/api/v1/payments/apple-order/receipt')

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ url: 'https://reportaproblem.apple.com/' })
  })

  it('lists paid orders independently of wallet rows, with stable pagination', async () => {
    const app = createApp('buyer')
    const first = await app.request('/api/v1/payments?limit=1&offset=0')
    expect(first.status).toBe(200)
    expect(first.headers.get('cache-control')).toBe('no-store')
    expect(await first.json()).toEqual({
      records: [{ id: 'stripe-order', processor: 'stripe', status: 'paid', amount: 60, currency: 'USD', fluxAmount: 2000, createdAt: '2026-10-01T00:00:00.000Z', creditedAt: '2026-11-02T00:00:00.000Z' }],
      hasMore: true,
    })
    const second = await app.request('/api/v1/payments?limit=1&offset=1')
    expect(await second.json()).toEqual({
      records: [{ id: 'same-date-order', processor: 'apple_iap', status: 'paid', amount: 0, currency: 'JPY', fluxAmount: null, createdAt: '2026-11-02T00:00:00.000Z', creditedAt: null }],
      hasMore: true,
    })
    const last = await app.request('/api/v1/payments?limit=10&offset=2')
    expect(await last.json()).toEqual({
      records: [{ id: 'apple-order', processor: 'apple_iap', status: 'paid', amount: null, currency: null, fluxAmount: null, createdAt: '2026-11-01T00:00:00.000Z', creditedAt: null }],
      hasMore: false,
    })
    expect(await (await app.request('/api/v1/payments?offset=3')).json()).toEqual({ records: [], hasMore: false })
    expect(await (await createApp('empty-buyer').request('/api/v1/payments')).json()).toEqual({ records: [], hasMore: false })
  })

  it.each([
    { processor: 'apple_iap', currency: 'usd', amount: 4990, expected: { amount: 4.99, currency: 'USD' } },
    { processor: 'stripe', currency: 'isk', amount: 6000, expected: { amount: 60, currency: 'ISK' } },
    { processor: 'stripe', currency: 'ugx', amount: 6000, expected: { amount: 60, currency: 'UGX' } },
    { processor: 'stripe', currency: 'jpy', amount: 6000, expected: { amount: 6000, currency: 'JPY' } },
    { processor: 'stripe', currency: 'kwd', amount: 6000, expected: { amount: 6, currency: 'KWD' } },
    { processor: 'stripe', currency: null, amount: 6000, expected: { amount: null, currency: null } },
    { processor: 'other-store', currency: 'usd', amount: 6000, expected: { amount: null, currency: null } },
  ])('returns normal currency units for $processor $currency', async ({ processor, currency, amount, expected }) => {
    const userId = `buyer-${processor}-${currency}`
    await db.insert(paymentOrder).values({ userId, processor, currency, amount, status: 'paid' })

    const response = await createApp(userId).request('/api/v1/payments')

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ records: [expected], hasMore: false })
  })

  it('uses the shared pagination bounds', async () => {
    const response = await createApp('buyer').request('/api/v1/payments?limit=0&offset=-1')
    const data = await response.json()
    expect(data).toMatchObject({ records: [{ id: 'stripe-order' }], hasMore: true })
  })

  it('requires authentication for the order list', async () => {
    expect((await createApp(null).request('/api/v1/payments')).status).toBe(401)
  })

  it('requires authentication', async () => {
    const response = await createApp(null).request('/api/v1/payments/apple-order/receipt')

    expect(response.status).toBe(401)
  })
})
