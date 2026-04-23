import type { StripeCheckoutSession, StripeInvoice } from '../../schemas/stripe'
import type { BillingService } from '../../services/billing/billing-service'
import type { ConfigKVService } from '../../services/config-kv'
import type { FluxService } from '../../services/flux'
import type { StripeService } from '../../services/stripe'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import { createStripeRoutes, formatPrice } from '.'
import { ApiError } from '../../utils/error'

// --- Mock helpers ---

function createMockFluxService(): FluxService {
  return {
    getFlux: vi.fn(async () => ({ userId: 'user-1', flux: 100 })),
    updateStripeCustomerId: vi.fn(),
  } as any
}

function createMockStripeService(overrides: Partial<StripeService> = {}): StripeService {
  return {
    upsertCustomer: vi.fn(async data => ({ id: 'id-1', createdAt: new Date(), updatedAt: new Date(), ...data })),
    getCustomerByUserId: vi.fn(async () => undefined),
    getCustomerByStripeId: vi.fn(async () => undefined),
    upsertCheckoutSession: vi.fn(async data => ({ id: 'id-1', fluxCredited: false, createdAt: new Date(), updatedAt: new Date(), ...data })),
    getCheckoutSessionsByUserId: vi.fn(async () => []),
    upsertSubscription: vi.fn(async data => ({ id: 'id-1', createdAt: new Date(), updatedAt: new Date(), ...data })),
    getActiveSubscription: vi.fn(async () => undefined),
    upsertInvoice: vi.fn(async data => ({ id: 'id-1', fluxCredited: false, createdAt: new Date(), updatedAt: new Date(), ...data })),
    getInvoicesByUserId: vi.fn(async () => []),
    ...overrides,
  } as any
}

function createMockBillingService(): BillingService {
  return {
    debitFlux: vi.fn(),
    creditFlux: vi.fn(),
    creditFluxFromStripeCheckout: vi.fn(async () => ({ applied: true, balanceAfter: 500 })),
    creditFluxFromInvoice: vi.fn(async () => ({ applied: true, balanceAfter: 500 })),
  } as any
}

function createMockConfigKV(overrides: Record<string, any> = {}): ConfigKVService {
  const defaults: Record<string, any> = {
    STRIPE_FLUX_PRODUCT_ID: 'prod_test_flux',
    STRIPE_PAYMENT_METHODS: ['card'],
    ...overrides,
  }
  return {
    getOrThrow: vi.fn(async (key: string) => {
      if (defaults[key] === undefined)
        throw new Error(`Config key "${key}" is not set`)
      return defaults[key]
    }),
    getOptional: vi.fn(async (key: string) => defaults[key] ?? null),
    get: vi.fn(async (key: string) => defaults[key]),
    set: vi.fn(),
  } as any
}

function createMockRedis(): any {
  const store = new Map<string, string>()
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => { store.set(key, value) }),
    del: vi.fn(async (key: string) => { store.delete(key) }),
  }
}

const testEnv = {
  STRIPE_SECRET_KEY: 'sk_test_fake',
  STRIPE_WEBHOOK_SECRET: 'whsec_test_fake',
  API_SERVER_URL: 'http://localhost:8787',
} as any

const testUser = { id: 'user-1', name: 'Test User', email: 'test@example.com' }

function createCheckoutSession(overrides: Partial<StripeCheckoutSession> = {}): StripeCheckoutSession {
  return {
    id: 'checkout-1',
    userId: 'user-1',
    stripeSessionId: 'cs_1',
    stripeCustomerId: null,
    mode: 'payment',
    status: 'open',
    paymentStatus: null,
    amountTotal: 500,
    currency: 'usd',
    successUrl: 'http://localhost/success',
    cancelUrl: 'http://localhost/cancel',
    stripePaymentIntentId: null,
    stripeSubscriptionId: null,
    fluxCredited: false,
    metadata: null,
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function createInvoice(overrides: Partial<StripeInvoice> = {}): StripeInvoice {
  return {
    id: 'invoice-1',
    userId: 'user-1',
    stripeInvoiceId: 'inv_1',
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    status: 'paid',
    amountDue: 500,
    amountPaid: 500,
    currency: 'usd',
    invoiceUrl: null,
    invoicePdf: null,
    periodStart: null,
    periodEnd: null,
    paidAt: null,
    fluxCredited: false,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
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
  const routes = createStripeRoutes(fluxService, stripeService, billingService, configKV, { ...testEnv, ...envOverrides }, createMockRedis())
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stripePriceId: 'price_test_500' }),
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
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stripePriceId: '' }),
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
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
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
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stripePriceId: 'price_test_500' }),
        }),
        { user: testUser } as any,
      )
      expect(res.status).toBe(503)
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
        createCheckoutSession({ id: '1', stripeSessionId: 'cs_1', status: 'complete' }),
        createCheckoutSession({ id: '2', stripeSessionId: 'cs_2', status: 'open' }),
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
      const mockInvoices = [createInvoice({ id: '1', stripeInvoiceId: 'inv_1', status: 'paid' })]
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
        method: 'POST',
        body: '{}',
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
        method: 'POST',
        headers: { 'stripe-signature': 'invalid_sig' },
        body: '{}',
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
        method: 'POST',
        headers: { 'stripe-signature': 'test_sig' },
        body: '{}',
      })
      expect(res.status).toBe(503)
    })
  })
})
