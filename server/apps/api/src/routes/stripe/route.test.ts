import type { StripeCheckoutSession, StripeInvoice } from '../../schemas/stripe'
import type { ConfigKVService } from '../../services/adapters/config-kv'
import type { BillingService } from '../../services/domain/billing/billing-service'
import type { FluxService } from '../../services/domain/flux'
import type { StripeService } from '../../services/domain/stripe'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import { createStripeRoutes, formatPrice } from '.'
import { createTestRedis } from '../../libs/tests/redis'
import { ApiError } from '../../utils/error'
import { createCheckoutOperation } from './operations/checkout'
import { createWebhookOperation } from './operations/webhook'

// --- Mock helpers ---

function createMockBillingService(): BillingService {
  return {
    creditFlux: vi.fn(),
    creditFluxFromInvoice: vi.fn(async () => ({ applied: true, balanceAfter: 500 })),
    creditFluxFromStripeCheckout: vi.fn(async () => ({ applied: true, balanceAfter: 500 })),
    debitFlux: vi.fn(),
  } as any
}

function createMockConfigKV(overrides: Record<string, any> = {}): ConfigKVService {
  const defaults: Record<string, any> = {
    STRIPE_FLUX_PRODUCT_ID: 'prod_test_flux',
    STRIPE_PAYMENT_METHODS: ['card'],
    ...overrides,
  }
  return {
    get: vi.fn(async (key: string) => defaults[key]),
    getOptional: vi.fn(async (key: string) => defaults[key] ?? null),
    getOrThrow: vi.fn(async (key: string) => {
      if (defaults[key] === undefined)
        throw new Error(`Config key "${key}" is not set`)
      return defaults[key]
    }),
    set: vi.fn(),
  } as any
}

function createMockFluxService(): FluxService {
  return {
    getFlux: vi.fn(async () => ({ flux: 100, userId: 'user-1' })),
    updateStripeCustomerId: vi.fn(),
  } as any
}

function createMockStripeCustomer(
  overrides: Partial<NonNullable<Awaited<ReturnType<StripeService['getCustomerByStripeId']>>>> = {},
): NonNullable<Awaited<ReturnType<StripeService['getCustomerByStripeId']>>> {
  const now = new Date()
  return {
    createdAt: now,
    deletedAt: null,
    email: null,
    id: 'stripe-customer-1',
    name: null,
    stripeCustomerId: 'cus_1',
    updatedAt: now,
    userId: 'user-1',
    ...overrides,
  }
}

function createMockStripeService(overrides: Partial<StripeService> = {}): StripeService {
  return {
    getActiveSubscription: vi.fn(async () => undefined),
    getCheckoutSessionsByUserId: vi.fn(async () => []),
    getCustomerByStripeId: vi.fn(async () => undefined),
    getCustomerByUserId: vi.fn(async () => undefined),
    getInvoicesByUserId: vi.fn(async () => []),
    upsertCheckoutSession: vi.fn(async data => ({ createdAt: new Date(), fluxCredited: false, id: 'id-1', updatedAt: new Date(), ...data })),
    upsertCustomer: vi.fn(async data => ({ createdAt: new Date(), id: 'id-1', updatedAt: new Date(), ...data })),
    upsertInvoice: vi.fn(async data => ({ createdAt: new Date(), fluxCredited: false, id: 'id-1', updatedAt: new Date(), ...data })),
    upsertSubscription: vi.fn(async data => ({ createdAt: new Date(), id: 'id-1', updatedAt: new Date(), ...data })),
    ...overrides,
  } as any
}

const testEnv = {
  API_SERVER_URL: 'http://localhost:8787',
  STRIPE_SECRET_KEY: 'sk_test_fake',
  STRIPE_WEBHOOK_SECRET: 'whsec_test_fake',
} as any

const testUser = { email: 'test@example.com', id: 'user-1', name: 'Test User' }

function createCheckoutSession(overrides: Partial<StripeCheckoutSession> = {}): StripeCheckoutSession {
  return {
    amountTotal: 500,
    cancelUrl: 'http://localhost/cancel',
    createdAt: new Date(),
    currency: 'usd',
    deletedAt: null,
    expiresAt: null,
    fluxCredited: false,
    id: 'checkout-1',
    metadata: null,
    mode: 'payment',
    paymentStatus: null,
    status: 'open',
    stripeCustomerId: null,
    stripePaymentIntentId: null,
    stripeSessionId: 'cs_1',
    stripeSubscriptionId: null,
    successUrl: 'http://localhost/success',
    updatedAt: new Date(),
    userId: 'user-1',
    ...overrides,
  }
}

function createInvoice(overrides: Partial<StripeInvoice> = {}): StripeInvoice {
  return {
    amountDue: 500,
    amountPaid: 500,
    createdAt: new Date(),
    currency: 'usd',
    deletedAt: null,
    fluxCredited: false,
    id: 'invoice-1',
    invoicePdf: null,
    invoiceUrl: null,
    metadata: null,
    paidAt: null,
    periodEnd: null,
    periodStart: null,
    status: 'paid',
    stripeCustomerId: null,
    stripeInvoiceId: 'inv_1',
    stripeSubscriptionId: null,
    updatedAt: new Date(),
    userId: 'user-1',
    ...overrides,
  }
}

function createTestApp(
  fluxService: FluxService,
  stripeService: StripeService,
  billingService: BillingService,
  configKV: ConfigKVService,
  envOverrides: Record<string, any> = {},
) {
  const routes = createStripeRoutes(fluxService, stripeService, billingService, configKV, { ...testEnv, ...envOverrides }, createTestRedis())
  const app = new Hono<HonoEnv>()

  app.onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json({
        details: err.details,
        error: err.errorCode,
        message: err.message,
      }, err.statusCode)
    }
    return c.json({ error: 'Internal Server Error', message: err.message }, 500)
  })

  // Inject user from env (simulates sessionMiddleware)
  app.use('*', async (c, next) => {
    const user = (c.env as any)?.user
    if (user) {
      c.set('user', user)
    }
    await next()
  })

  app.route('/api/v1/stripe', routes)
  return app
}

// --- Tests ---

describe('formatPrice', () => {
  it('formats USD cents correctly', () => {
    expect(formatPrice(300, 'usd')).toBe('$3.00')
    expect(formatPrice(1200, 'usd')).toBe('$12.00')
    expect(formatPrice(2500, 'usd')).toBe('$25.00')
  })

  it('formats CNY cents correctly', () => {
    expect(formatPrice(2100, 'cny')).toBe('CN¥21.00')
  })

  it('formats JPY (zero-decimal currency) correctly', () => {
    expect(formatPrice(500, 'jpy')).toBe('¥500')
  })

  it('formats GBP correctly', () => {
    expect(formatPrice(1599, 'gbp')).toBe('£15.99')
  })

  it('returns currency code for null amount', () => {
    expect(formatPrice(null, 'usd')).toBe('USD')
  })

  it('handles zero amount', () => {
    expect(formatPrice(0, 'usd')).toBe('$0.00')
  })
})

describe('stripeRoutes', () => {
  describe('gET /api/v1/stripe/packages', () => {
    it('returns empty array when Stripe is not configured', async () => {
      const app = createTestApp(
        createMockFluxService(),
        createMockStripeService(),
        createMockBillingService(),
        createMockConfigKV({ STRIPE_FLUX_PRODUCT_ID: undefined }),
        { STRIPE_SECRET_KEY: '' },
      )

      const res = await app.request('/api/v1/stripe/packages')
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual([])
    })
  })

  describe('pOST /api/v1/stripe/checkout', () => {
    it('returns 401 when unauthenticated', async () => {
      const app = createTestApp(
        createMockFluxService(),
        createMockStripeService(),
        createMockBillingService(),
        createMockConfigKV(),
      )

      const res = await app.request('/api/v1/stripe/checkout', {
        body: JSON.stringify({ stripePriceId: 'price_test_500' }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      expect(res.status).toBe(401)
    })

    it('returns 400 for empty stripePriceId', async () => {
      const app = createTestApp(
        createMockFluxService(),
        createMockStripeService(),
        createMockBillingService(),
        createMockConfigKV(),
      )

      const res = await app.fetch(
        new Request('http://localhost/api/v1/stripe/checkout', {
          body: JSON.stringify({ stripePriceId: '' }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        }),
        { user: testUser } as any,
      )
      expect(res.status).toBe(400)
    })

    it('returns 400 for missing stripePriceId', async () => {
      const app = createTestApp(
        createMockFluxService(),
        createMockStripeService(),
        createMockBillingService(),
        createMockConfigKV(),
      )

      const res = await app.fetch(
        new Request('http://localhost/api/v1/stripe/checkout', {
          body: JSON.stringify({}),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        }),
        { user: testUser } as any,
      )
      expect(res.status).toBe(400)
    })

    it('returns 503 when Stripe is not configured', async () => {
      const app = createTestApp(
        createMockFluxService(),
        createMockStripeService(),
        createMockBillingService(),
        createMockConfigKV({ STRIPE_FLUX_PRODUCT_ID: undefined }),
        { STRIPE_SECRET_KEY: '' },
      )

      const res = await app.fetch(
        new Request('http://localhost/api/v1/stripe/checkout', {
          body: JSON.stringify({ stripePriceId: 'price_test_500' }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        }),
        { user: testUser } as any,
      )
      expect(res.status).toBe(503)
    })

    it('stores browser PostHog identity in Stripe checkout metadata', async () => {
      const createSession = vi.fn(async input => ({
        amount_total: 500,
        cancel_url: 'http://localhost/settings/flux?canceled=true',
        currency: 'usd',
        customer: null,
        expires_at: null,
        id: 'cs_1',
        metadata: input.metadata,
        mode: 'payment',
        payment_intent: null,
        payment_status: 'unpaid',
        status: 'open',
        subscription: null,
        success_url: 'http://localhost/settings/flux?success=true',
        url: 'https://checkout.stripe.com/cs_1',
      }))
      const productEventService = { track: vi.fn() }
      const operation = createCheckoutOperation({
        configKV: createMockConfigKV({ STRIPE_PAYMENT_METHODS: undefined }),
        env: testEnv,
        priceCatalog: {
          findActivePrice: vi.fn(async () => ({
            currency: 'usd',
            currencyOptions: {},
            id: 'price_test_500',
            metadata: { fluxAmount: '500' },
            unitAmount: 500,
          })),
          getActivePrices: vi.fn(),
        } as any,
        productEventService: productEventService as any,
        stripe: {
          checkout: {
            sessions: {
              create: createSession,
            },
          },
        } as any,
        stripeService: createMockStripeService(),
      })

      await operation({
        body: { stripePriceId: 'price_test_500' },
        request: new Request('http://localhost/api/v1/stripe/checkout', {
          headers: {
            'x-posthog-distinct-id': 'anon-browser-1',
            'x-posthog-session-id': 'ph-session-1',
          },
        }),
        user: testUser as any,
      })

      expect(createSession).toHaveBeenCalledWith(expect.objectContaining({
        metadata: {
          fluxAmount: '500',
          posthogDistinctId: 'anon-browser-1',
          posthogSessionId: 'ph-session-1',
          userId: 'user-1',
        },
      }))
      expect(productEventService.track).toHaveBeenCalledWith(expect.objectContaining({
        action: 'checkout_started',
        metadata: expect.objectContaining({
          posthog_distinct_id: 'anon-browser-1',
          posthog_session_id: 'ph-session-1',
        }),
        userId: 'user-1',
      }))
    })
  })

  describe('gET /api/v1/stripe/orders', () => {
    it('returns 401 when unauthenticated', async () => {
      const app = createTestApp(
        createMockFluxService(),
        createMockStripeService(),
        createMockBillingService(),
        createMockConfigKV(),
      )

      const res = await app.request('/api/v1/stripe/orders')
      expect(res.status).toBe(401)
    })

    it('returns checkout sessions for the authenticated user', async () => {
      const mockSessions = [
        createCheckoutSession({ id: '1', status: 'complete', stripeSessionId: 'cs_1' }),
        createCheckoutSession({ id: '2', status: 'open', stripeSessionId: 'cs_2' }),
      ]
      const stripeService = createMockStripeService({
        getCheckoutSessionsByUserId: vi.fn(async () => mockSessions),
      })
      const app = createTestApp(
        createMockFluxService(),
        stripeService,
        createMockBillingService(),
        createMockConfigKV(),
      )

      const res = await app.fetch(
        new Request('http://localhost/api/v1/stripe/orders'),
        { user: testUser } as any,
      )
      expect(res.status).toBe(200)

      const data = await res.json()
      expect(data).toHaveLength(2)
      expect(stripeService.getCheckoutSessionsByUserId).toHaveBeenCalledWith('user-1')
    })
  })

  describe('gET /api/v1/stripe/invoices', () => {
    it('returns 401 when unauthenticated', async () => {
      const app = createTestApp(
        createMockFluxService(),
        createMockStripeService(),
        createMockBillingService(),
        createMockConfigKV(),
      )

      const res = await app.request('/api/v1/stripe/invoices')
      expect(res.status).toBe(401)
    })

    it('returns invoices for the authenticated user', async () => {
      const mockInvoices = [createInvoice({ id: '1', status: 'paid', stripeInvoiceId: 'inv_1' })]
      const stripeService = createMockStripeService({
        getInvoicesByUserId: vi.fn(async () => mockInvoices),
      })
      const app = createTestApp(
        createMockFluxService(),
        stripeService,
        createMockBillingService(),
        createMockConfigKV(),
      )

      const res = await app.fetch(
        new Request('http://localhost/api/v1/stripe/invoices'),
        { user: testUser } as any,
      )
      expect(res.status).toBe(200)

      const data = await res.json()
      expect(data).toHaveLength(1)
      expect(stripeService.getInvoicesByUserId).toHaveBeenCalledWith('user-1')
    })
  })

  describe('pOST /api/v1/stripe/portal', () => {
    it('returns 401 when unauthenticated', async () => {
      const app = createTestApp(
        createMockFluxService(),
        createMockStripeService(),
        createMockBillingService(),
        createMockConfigKV(),
      )

      const res = await app.request('/api/v1/stripe/portal', { method: 'POST' })
      expect(res.status).toBe(401)
    })

    it('returns 400 when user has no billing account', async () => {
      const stripeService = createMockStripeService({
        getCustomerByUserId: vi.fn(async () => undefined),
      })
      const app = createTestApp(
        createMockFluxService(),
        stripeService,
        createMockBillingService(),
        createMockConfigKV(),
      )

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
      const app = createTestApp(
        createMockFluxService(),
        createMockStripeService(),
        createMockBillingService(),
        createMockConfigKV(),
      )

      const res = await app.request('/api/v1/stripe/webhook', {
        body: '{}',
        method: 'POST',
      })
      expect(res.status).toBe(400)

      const data = await res.json() as any
      expect(data.error).toBe('MISSING_SIGNATURE')
    })

    it('returns 400 when signature is invalid', async () => {
      const app = createTestApp(
        createMockFluxService(),
        createMockStripeService(),
        createMockBillingService(),
        createMockConfigKV(),
      )

      const res = await app.request('/api/v1/stripe/webhook', {
        body: '{}',
        headers: { 'stripe-signature': 'invalid_sig' },
        method: 'POST',
      })
      expect(res.status).toBe(400)

      const data = await res.json() as any
      expect(data.error).toBe('WEBHOOK_ERROR')
    })

    it('returns 503 when Stripe is not configured', async () => {
      const app = createTestApp(
        createMockFluxService(),
        createMockStripeService(),
        createMockBillingService(),
        createMockConfigKV(),
        { STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '' },
      )

      const res = await app.request('/api/v1/stripe/webhook', {
        body: '{}',
        headers: { 'stripe-signature': 'test_sig' },
        method: 'POST',
      })
      expect(res.status).toBe(503)
    })

    it('records payment completion with Stripe and PostHog identity from checkout metadata', async () => {
      const checkoutEvent = {
        data: {
          object: {
            amount_total: 500,
            cancel_url: 'http://localhost/settings/flux?canceled=true',
            currency: 'usd',
            customer: 'cus_1',
            customer_email: 'test@example.com',
            expires_at: null,
            id: 'cs_1',
            metadata: {
              fluxAmount: '500',
              posthogDistinctId: 'anon-browser-1',
              posthogSessionId: 'ph-session-1',
              userId: 'user-1',
            },
            mode: 'payment',
            payment_intent: 'pi_1',
            payment_status: 'paid',
            status: 'complete',
            subscription: null,
            success_url: 'http://localhost/settings/flux?success=true',
          },
        },
        id: 'evt_checkout_completed',
        type: 'checkout.session.completed',
      }
      const productEventService = { track: vi.fn() }
      const billingService = createMockBillingService()
      const webhook = createWebhookOperation({
        billingService,
        fluxService: createMockFluxService(),
        productEventService: productEventService as any,
        stripe: {
          webhooks: {
            constructEvent: vi.fn(() => checkoutEvent),
          },
        } as any,
        stripeService: createMockStripeService(),
        webhookSecret: 'whsec_test',
      })

      await webhook({ body: '{}', signature: 'test_sig' })

      expect(billingService.creditFluxFromStripeCheckout).toHaveBeenCalledWith(expect.objectContaining({
        fluxAmount: 500,
        stripeEventId: 'evt_checkout_completed',
        stripeSessionId: 'cs_1',
        userId: 'user-1',
      }))
      expect(productEventService.track).toHaveBeenCalledWith({
        action: 'payment_completed',
        eventId: 'cs_1',
        feature: 'billing',
        metadata: {
          amount_total: 500,
          currency: 'usd',
          flux_amount: 500,
          posthog_distinct_id: 'anon-browser-1',
          posthog_session_id: 'ph-session-1',
          stripe_checkout_session_id: 'cs_1',
          stripe_customer_id: 'cus_1',
        },
        source: 'stripe.webhook',
        status: 'succeeded',
        userId: 'user-1',
      })
    })

    it('processes subscription lifecycle webhooks without product events', async () => {
      const subscriptionEvent = {
        data: {
          object: {
            cancel_at_period_end: false,
            canceled_at: null,
            customer: 'cus_1',
            ended_at: null,
            id: 'sub_1',
            items: {
              data: [{
                current_period_end: 2_000,
                current_period_start: 1_000,
                price: { id: 'price_1' },
              }],
            },
            metadata: {},
            status: 'active',
          },
        },
        id: 'evt_sub_created',
        type: 'customer.subscription.created',
      }
      const stripeService = createMockStripeService({
        getCustomerByStripeId: vi.fn(async () => createMockStripeCustomer()),
      })
      const productEventService = { track: vi.fn(async () => undefined) }
      const webhook = createWebhookOperation({
        billingService: createMockBillingService(),
        fluxService: createMockFluxService(),
        productEventService: productEventService as any,
        stripe: {
          webhooks: {
            constructEvent: vi.fn(() => subscriptionEvent),
          },
        } as any,
        stripeService,
        webhookSecret: 'whsec_test',
      })

      await webhook({ body: '{}', signature: 'test_sig' })

      expect(stripeService.upsertSubscription).toHaveBeenCalledWith(expect.objectContaining({
        cancelAtPeriodEnd: false,
        status: 'active',
        stripeCustomerId: 'cus_1',
        stripePriceId: 'price_1',
        stripeSubscriptionId: 'sub_1',
        userId: 'user-1',
      }))
      expect(productEventService.track).not.toHaveBeenCalled()
    })

    it('records subscription renewals only for subscription-cycle paid invoices', async () => {
      const invoiceEvent = {
        data: {
          object: {
            amount_due: 1_200,
            amount_paid: 1_200,
            billing_reason: 'subscription_cycle',
            currency: 'usd',
            customer: 'cus_1',
            hosted_invoice_url: null,
            id: 'inv_1',
            invoice_pdf: null,
            metadata: {},
            parent: {
              subscription_details: {
                subscription: 'sub_1',
              },
            },
            period_end: 2_000,
            period_start: 1_000,
            status: 'paid',
            status_transitions: {
              paid_at: 1_500,
            },
          },
        },
        id: 'evt_invoice_paid',
        type: 'invoice.paid',
      }
      const stripeService = createMockStripeService({
        getCustomerByStripeId: vi.fn(async () => createMockStripeCustomer()),
      })
      const productEventService = { track: vi.fn(async () => undefined) }
      const webhook = createWebhookOperation({
        billingService: createMockBillingService(),
        fluxService: createMockFluxService(),
        productEventService: productEventService as any,
        stripe: {
          webhooks: {
            constructEvent: vi.fn(() => invoiceEvent),
          },
        } as any,
        stripeService,
        webhookSecret: 'whsec_test',
      })

      await webhook({ body: '{}', signature: 'test_sig' })

      expect(stripeService.upsertInvoice).toHaveBeenCalledWith(expect.objectContaining({
        amountDue: 1_200,
        amountPaid: 1_200,
        status: 'paid',
        stripeCustomerId: 'cus_1',
        stripeInvoiceId: 'inv_1',
        stripeSubscriptionId: 'sub_1',
        userId: 'user-1',
      }))
      expect(productEventService.track).not.toHaveBeenCalled()
    })
  })
})
