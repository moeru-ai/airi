import type { Database } from '../../libs/db'
import type { HonoEnv } from '../../types/hono'

import { useLogger } from '@guiiai/logg'
import { createErrorHandler } from '@proj-airi/http-error-shared'
import { Hono } from 'hono'
import { beforeAll, describe, expect, it } from 'vitest'

import { createPaymentRoutes } from '.'
import { mockDB } from '../../libs/mock-db'
import { paymentOrder } from '../../schemas/payment'
import { createPaymentReceiptService } from '../../services/domain/payment/receipt'

describe('payment receipt route', () => {
  let db: Database

  beforeAll(async () => {
    db = await mockDB({ paymentOrder })
    await db.insert(paymentOrder).values({ id: 'apple-order', userId: 'buyer', processor: 'apple_iap', status: 'paid' })
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
    app.route('/api/v1/payments', createPaymentRoutes(createPaymentReceiptService(db, null)))
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
})
