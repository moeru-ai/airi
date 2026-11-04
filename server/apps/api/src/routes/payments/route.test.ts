import type { Database } from '../../libs/db'
import type { ReceiptResolver } from '../../services/domain/payment/receipt'
import type { HonoEnv } from '../../types/hono'

import Stripe from 'stripe'

import { useLogger } from '@guiiai/logg'
import { createErrorHandler } from '@proj-airi/http-error-shared'
import { Hono } from 'hono'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { createPaymentRoutes } from '.'
import { mockDB } from '../../libs/mock-db'
import { paymentOrder } from '../../schemas/payment'
import { appleReceiptResolver } from '../../services/adapters/payment-receipts/apple-receipt'
import { createStripeReceiptResolver } from '../../services/adapters/payment-receipts/stripe-receipt'
import { createPaymentReceiptService } from '../../services/domain/payment/receipt'

describe('payment receipt route', () => {
  let db: Database

  beforeAll(async () => {
    db = await mockDB({ paymentOrder })
    await db.insert(paymentOrder).values([
      { id: 'apple-order', userId: 'buyer', processor: 'apple_iap', status: 'paid' },
      { id: 'stripe-order', userId: 'buyer', processor: 'stripe', processorOrderId: 'cs_original', status: 'paid' },
    ])
  })

  function createApp(userId: string | null, resolvers: readonly ReceiptResolver[] = [appleReceiptResolver]) {
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
    app.route('/api/v1/payments', createPaymentRoutes(createPaymentReceiptService(db, resolvers)))
    return app
  }

  it('returns an owned order destination as a private resource', async () => {
    const response = await createApp('buyer').request('/api/v1/payments/apple-order/receipt')

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ url: 'https://reportaproblem.apple.com/' })
  })

  it('requires authentication', async () => {
    const response = await createApp(null).request('/api/v1/payments/apple-order/receipt')

    expect(response.status).toBe(401)
  })

  it('hides foreign orders', async () => {
    const response = await createApp('other-buyer').request('/api/v1/payments/apple-order/receipt')

    expect(response.status).toBe(404)
  })

  it('returns an explicit unavailable error for a malformed Stripe response', async () => {
    const stripe = new Stripe('sk_test_receipts')
    vi.spyOn(stripe.checkout.sessions, 'retrieve').mockImplementation(vi.fn().mockResolvedValue({
      invoice: { hosted_invoice_url: 'javascript:alert(1)' },
      payment_intent: null,
    }))
    const app = createApp('buyer', [createStripeReceiptResolver(stripe)])

    const response = await app.request('/api/v1/payments/stripe-order/receipt')

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'PAYMENT_RECEIPT_UNAVAILABLE', message: 'Payment receipt is unavailable' })
  })
})
