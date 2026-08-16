import type { PaymentProvider, PaymentService } from '../../services/domain/payment'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import { createStripeRoutes } from '.'
import { ApiError } from '../../utils/error'
import { createCheckoutOperation } from './operations/checkout'
import { createWebhookOperation } from './operations/webhook'

function createMockPayment(overrides: Partial<PaymentService> = {}): PaymentService {
  return {
    listPacks: vi.fn(async () => []),
    resolvePack: vi.fn(async () => ({
      key: 'starter',
      name: '500 Flux',
      fluxAmount: 500,
      recommended: false,
      providers: { stripe: { priceId: 'price_test_500' } },
    })),
    getProviderAccount: vi.fn(async () => null),
    startPack: vi.fn(async () => ({ kind: 'redirect' as const, url: 'https://checkout.stripe.com/cs_1', paymentOrderId: 'po_1' })),
    applyConfirmation: vi.fn(async () => ({ applied: true, userId: 'user-1', fluxAmount: 500, balanceAfter: 500 })),
    cancel: vi.fn(),
    deleteAllForUser: vi.fn(),
    ...overrides,
  } as PaymentService
}

function createMockStripeAdapter(): PaymentProvider {
  return {
    create: vi.fn(),
    listPackages: vi.fn(async () => []),
    confirmed: vi.fn((native: any) => ({
      provider: 'stripe' as const,
      paymentOrderId: native.metadata?.payment_order_id,
      providerOrderId: native.id,
      status: native.status === 'expired' ? 'expired' as const : 'paid' as const,
      amount: native.amount_total,
      currency: native.currency,
      providerCustomerId: native.customer,
    })),
    cancel: vi.fn(),
    getStatus: vi.fn(async () => null),
  }
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
  stripe: any = { billingPortal: { sessions: { create: vi.fn() } }, webhooks: { constructEvent: vi.fn() } },
) {
  const routes = createStripeRoutes({
    payment,
    stripeAdapter: createMockStripeAdapter(),
    stripe: envOverrides.STRIPE_SECRET_KEY === '' ? null : stripe,
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
    it('returns ConfigKV packs', async () => {
      const payment = createMockPayment({
        listPacks: vi.fn(async () => [{
          packKey: 'starter',
          stripePriceId: 'price_test_500',
          label: '500 Flux',
          defaultCurrency: 'usd',
          currencies: { usd: '$5.00' },
          recommended: false,
        }]),
      })
      const app = createTestApp(payment)

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

    it('returns 400 when planKey is sent', async () => {
      const app = createTestApp(createMockPayment())
      const res = await app.fetch(
        new Request('http://localhost/api/v1/stripe/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planKey: 'pro' }),
        }),
        { user: testUser } as any,
      )
      expect(res.status).toBe(400)
      const data = await res.json() as any
      expect(data.error).toBe('PLAN_CHECKOUT_UNAVAILABLE')
    })

    it('starts a pack checkout from packKey', async () => {
      const payment = createMockPayment()
      const app = createTestApp(payment)
      const res = await app.fetch(
        new Request('http://localhost/api/v1/stripe/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ packKey: 'starter', currency: 'usd' }),
        }),
        { user: testUser } as any,
      )
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ url: 'https://checkout.stripe.com/cs_1' })
      expect(payment.startPack).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'user-1',
        provider: 'stripe',
        packKey: 'starter',
      }))
    })

    it('resolves legacy stripePriceId onto startPack', async () => {
      const payment = createMockPayment()
      const app = createTestApp(payment)
      const res = await app.fetch(
        new Request('http://localhost/api/v1/stripe/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stripePriceId: 'price_test_500' }),
        }),
        { user: testUser } as any,
      )
      expect(res.status).toBe(200)
      expect(payment.resolvePack).toHaveBeenCalledWith({
        provider: 'stripe',
        providerProductId: 'price_test_500',
      })
      expect(payment.startPack).toHaveBeenCalledWith(expect.objectContaining({ packKey: 'starter' }))
    })

    it('stores browser PostHog identity in startContext metadata', async () => {
      const payment = createMockPayment()
      const productEventService = { track: vi.fn() }
      const operation = createCheckoutOperation({
        payment,
        env: testEnv,
        productEventService: productEventService as any,
      })

      await operation({
        user: testUser as any,
        body: { packKey: 'starter' },
        request: new Request('http://localhost/api/v1/stripe/checkout', {
          headers: {
            'x-posthog-distinct-id': 'anon-browser-1',
            'x-posthog-session-id': 'ph-session-1',
          },
        }),
      })

      expect(payment.startPack).toHaveBeenCalledWith(expect.objectContaining({
        startContext: expect.objectContaining({
          metadata: {
            posthogDistinctId: 'anon-browser-1',
            posthogSessionId: 'ph-session-1',
          },
        }),
      }))
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
    it('returns 401 when unauthenticated', async () => {
      const app = createTestApp(createMockPayment())
      const res = await app.request('/api/v1/stripe/portal', { method: 'POST' })
      expect(res.status).toBe(401)
    })

    it('returns 400 when user has no billing account', async () => {
      const app = createTestApp(createMockPayment())
      const res = await app.fetch(
        new Request('http://localhost/api/v1/stripe/portal', { method: 'POST' }),
        { user: testUser } as any,
      )
      expect(res.status).toBe(400)
      const data = await res.json() as any
      expect(data.error).toBe('NO_CUSTOMER')
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

    it('applies confirmation for a paid checkout session', async () => {
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
      const stripeAdapter = createMockStripeAdapter()
      const productEventService = { track: vi.fn() }
      const webhook = createWebhookOperation({
        stripe: {
          webhooks: {
            constructEvent: vi.fn(() => checkoutEvent),
          },
        } as any,
        webhookSecret: 'whsec_test',
        stripeAdapter,
        payment,
        productEventService: productEventService as any,
      })

      await webhook({ signature: 'test_sig', body: '{}' })

      expect(stripeAdapter.confirmed).toHaveBeenCalled()
      expect(payment.applyConfirmation).toHaveBeenCalledWith(expect.objectContaining({
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

    it('logs subscription events and does not apply confirmation', async () => {
      const payment = createMockPayment()
      const webhook = createWebhookOperation({
        stripe: {
          webhooks: {
            constructEvent: vi.fn(() => ({
              id: 'evt_sub',
              type: 'customer.subscription.created',
              data: { object: { id: 'sub_1' } },
            })),
          },
        } as any,
        webhookSecret: 'whsec_test',
        stripeAdapter: createMockStripeAdapter(),
        payment,
      })

      await webhook({ signature: 'test_sig', body: '{}' })
      expect(payment.applyConfirmation).not.toHaveBeenCalled()
    })
  })
})
