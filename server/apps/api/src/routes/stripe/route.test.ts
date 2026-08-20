import type { ConfigKVService } from '../../services/adapters/config-kv'
import type { PaymentService } from '../../services/domain/payment'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import { createStripeRoutes } from '.'
import { ApiError } from '../../utils/error'
import { createWebhookOperation } from './operations/webhook'

function createMockPayment(overrides: Partial<PaymentService> = {}): PaymentService {
  return {
    settle: vi.fn(async () => ({ applied: true, userId: 'user-1', fluxAmount: 500, balanceAfter: 500 })),
    deleteAllForUser: vi.fn(),
    ...overrides,
  }
}

function createMockConfigKV(overrides: Partial<ConfigKVService> = {}): ConfigKVService {
  return {
    getOptional: vi.fn(async (key: string) => {
      if (key === 'FLUX_PACKS') {
        return [{
          key: 'starter',
          name: '500 Flux',
          fluxAmount: 500,
          recommended: false,
          providers: { stripe: { priceId: 'price_test_500' } },
        }]
      }
      return null
    }),
    getOrThrow: vi.fn(),
    get: vi.fn(),
    refresh: vi.fn(),
    invalidateCache: vi.fn(),
    ...overrides,
  } as ConfigKVService
}

const testEnv = {
  STRIPE_SECRET_KEY: 'sk_test_fake',
  STRIPE_WEBHOOK_SECRET: 'whsec_test_fake',
  API_SERVER_URL: 'http://localhost:8787',
  WEB_APP_URL: 'https://airi.moeru.ai',
  ADDITIONAL_TRUSTED_ORIGINS: [],
} as any

const testUser = { id: 'user-1', name: 'Test User', email: 'test@example.com' }

function createTestApp(
  payment: PaymentService,
  envOverrides: Record<string, any> = {},
  stripe: any = {
    prices: { retrieve: vi.fn() },
    checkout: { sessions: { create: vi.fn() } },
    webhooks: { constructEvent: vi.fn() },
  },
  configKV: ConfigKVService = createMockConfigKV(),
) {
  const routes = createStripeRoutes({
    payment,
    db: {} as never,
    stripe: envOverrides.STRIPE_SECRET_KEY === '' ? null : stripe,
    configKV,
    env: { ...testEnv, ...envOverrides },
  })
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
    const user = (c.env as any)?.user
    if (user)
      c.set('user', user)
    await next()
  })

  app.route('/api/v1/stripe', routes)
  return app
}

describe('stripeRoutes', () => {
  describe('gET /api/v1/stripe/packages', () => {
    it('returns ConfigKV packs with Stripe display prices', async () => {
      const stripe = {
        prices: {
          retrieve: vi.fn(async () => ({
            id: 'price_test_500',
            currency: 'usd',
            unit_amount: 500,
            currency_options: {},
          })),
        },
        webhooks: { constructEvent: vi.fn() },
      }
      const app = createTestApp(createMockPayment(), {}, stripe)

      const res = await app.request('/api/v1/stripe/packages')
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual([{
        packKey: 'starter',
        stripePriceId: 'price_test_500',
        label: '500 Flux',
        defaultCurrency: 'usd',
        currencies: { usd: '$5.00' },
        recommended: false,
      }])
    })
  })

  describe('pOST /api/v1/stripe/checkout', () => {
    it('returns 401 when unauthenticated', async () => {
      const app = createTestApp(createMockPayment())
      const res = await app.request('/api/v1/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packKey: 'starter' }),
      })
      expect(res.status).toBe(401)
    })

    it('returns 400 for an empty body', async () => {
      const app = createTestApp(createMockPayment())
      const res = await app.fetch(
        new Request('http://localhost/api/v1/stripe/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }),
        { user: testUser } as any,
      )
      expect(res.status).toBe(400)
    })
  })

  describe('gET /api/v1/stripe/orders', () => {
    it('returns 404 after the orders list was removed', async () => {
      const app = createTestApp(createMockPayment())
      const res = await app.fetch(
        new Request('http://localhost/api/v1/stripe/orders'),
        { user: testUser } as any,
      )
      expect(res.status).toBe(404)
    })
  })

  describe('gET /api/v1/stripe/invoices', () => {
    it('returns 404 after the invoices list was removed', async () => {
      const app = createTestApp(createMockPayment())
      const res = await app.fetch(
        new Request('http://localhost/api/v1/stripe/invoices'),
        { user: testUser } as any,
      )
      expect(res.status).toBe(404)
    })
  })

  describe('pOST /api/v1/stripe/portal', () => {
    it('returns 404 after the billing portal was removed', async () => {
      const app = createTestApp(createMockPayment())
      const res = await app.fetch(
        new Request('http://localhost/api/v1/stripe/portal', { method: 'POST' }),
        { user: testUser } as any,
      )
      expect(res.status).toBe(404)
    })
  })

  describe('pOST /api/v1/stripe/webhook', () => {
    it('returns 400 when signature is missing', async () => {
      const app = createTestApp(createMockPayment())
      const res = await app.request('/api/v1/stripe/webhook', {
        method: 'POST',
        body: '{}',
      })
      expect(res.status).toBe(400)
      const data = await res.json() as any
      expect(data.error).toBe('MISSING_SIGNATURE')
    })

    it('returns 400 when signature is invalid', async () => {
      const stripe = {
        webhooks: {
          constructEvent: vi.fn(() => {
            throw new Error('bad sig')
          }),
        },
      }
      const app = createTestApp(createMockPayment(), {}, stripe)
      const res = await app.request('/api/v1/stripe/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': 'invalid_sig' },
        body: '{}',
      })
      expect(res.status).toBe(400)
      const data = await res.json() as any
      expect(data.error).toBe('WEBHOOK_ERROR')
    })

    it('returns 503 when Stripe is not configured', async () => {
      const app = createTestApp(createMockPayment(), { STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '' })
      const res = await app.request('/api/v1/stripe/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': 'test_sig' },
        body: '{}',
      })
      expect(res.status).toBe(503)
    })

    it('settles a paid checkout session', async () => {
      const checkoutEvent = {
        id: 'evt_checkout_completed',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_1',
            customer: 'cus_1',
            mode: 'payment',
            status: 'complete',
            payment_status: 'paid',
            amount_total: 500,
            currency: 'usd',
            metadata: {
              payment_order_id: 'po_1',
              packKey: 'starter',
              posthogDistinctId: 'anon-browser-1',
              posthogSessionId: 'ph-session-1',
            },
          },
        },
      }
      const payment = createMockPayment()
      const productEventService = { track: vi.fn() }
      const webhook = createWebhookOperation({
        stripe: {
          webhooks: {
            constructEvent: vi.fn(() => checkoutEvent),
          },
        } as any,
        webhookSecret: 'whsec_test',
        payment,
        productEventService: productEventService as any,
      })

      await webhook({ signature: 'test_sig', body: '{}' })

      expect(payment.settle).toHaveBeenCalledWith(expect.objectContaining({
        kind: 'claim',
        provider: 'stripe',
        paymentOrderId: 'po_1',
        providerOrderId: 'cs_1',
        status: 'paid',
      }))
      expect(productEventService.track).toHaveBeenCalledWith(expect.objectContaining({
        action: 'payment_completed',
        metadata: expect.objectContaining({
          posthog_distinct_id: 'anon-browser-1',
          pack_key: 'starter',
        }),
      }))
    })

    it('ignores unknown events and does not settle', async () => {
      const payment = createMockPayment()
      const webhook = createWebhookOperation({
        stripe: {
          webhooks: {
            constructEvent: vi.fn(() => ({
              id: 'evt_charge',
              type: 'charge.succeeded',
              data: { object: { id: 'ch_1' } },
            })),
          },
        } as any,
        webhookSecret: 'whsec_test',
        payment,
      })

      await webhook({ signature: 'test_sig', body: '{}' })
      expect(payment.settle).not.toHaveBeenCalled()
    })
  })
})
