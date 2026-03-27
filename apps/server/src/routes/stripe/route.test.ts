import type { StripeCheckoutSession, StripeInvoice } from '../../schemas/stripe'
import type { BillingService } from '../../services/billing/billing-service'
import type { ConfigKVService } from '../../services/config-kv'
import type { FluxService } from '../../services/flux'
import type { StripeService } from '../../services/stripe'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import { createStripeRoutes } from '.'
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
    FLUX_PACKAGES: [{ amount: 500, fluxAmount: 5000, label: '5000 Flux', price: '$5' }],
    MAX_CHECKOUT_AMOUNT_CENTS: 1_000_000,
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
) {
  const routes = createStripeRoutes(fluxService, stripeService, billingService, configKV, testEnv)
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

describe('stripeRoutes', () => {
  describe('gET /api/v1/stripe/packages', () => {
    it('returns configured packages', async () => {
      const app = createTestApp(
        createMockFluxService(),
        createMockStripeService(),
        createMockBillingService(),
        createMockConfigKV(),
      )

      const res = await app.request('/api/v1/stripe/packages')
      expect(res.status).toBe(200)

      const data = await res.json()
      expect(data).toEqual([{ amount: 500, fluxAmount: 5000, label: '5000 Flux', price: '$5' }])
    })

    it('returns empty array when no packages configured', async () => {
      const configKV = createMockConfigKV({ FLUX_PACKAGES: [] })
      const app = createTestApp(
        createMockFluxService(),
        createMockStripeService(),
        createMockBillingService(),
        configKV,
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
        body: JSON.stringify({ amount: 500 }),
      })
      expect(res.status).toBe(401)
    })

    it('returns 400 for invalid amount (zero)', async () => {
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
          body: JSON.stringify({ amount: 0 }),
        }),
        { user: testUser } as any,
      )
      expect(res.status).toBe(400)
    })

    it('returns 400 for invalid amount (negative)', async () => {
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
          body: JSON.stringify({ amount: -100 }),
        }),
        { user: testUser } as any,
      )
      expect(res.status).toBe(400)
    })

    it('returns 400 for amount exceeding max ($10,000)', async () => {
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
          body: JSON.stringify({ amount: 1_000_001 }),
        }),
        { user: testUser } as any,
      )
      expect(res.status).toBe(400)
    })

    it('respects configured max checkout amount', async () => {
      const app = createTestApp(
        createMockFluxService(),
        createMockStripeService(),
        createMockBillingService(),
        createMockConfigKV({ MAX_CHECKOUT_AMOUNT_CENTS: 500 }),
      )

      const res = await app.fetch(
        new Request('http://localhost/api/v1/stripe/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: 501 }),
        }),
        { user: testUser } as any,
      )

      expect(res.status).toBe(400)
    })

    it('returns 400 for non-integer amount', async () => {
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
          body: JSON.stringify({ amount: 9.99 }),
        }),
        { user: testUser } as any,
      )
      expect(res.status).toBe(400)
    })

    it('returns 503 when Stripe is not configured', async () => {
      const routes = createStripeRoutes(
        createMockFluxService(),
        createMockStripeService(),
        createMockBillingService(),
        createMockConfigKV(),
        { ...testEnv, STRIPE_SECRET_KEY: '' } as any,
      )
      const app = new Hono<HonoEnv>()
      app.onError((err, c) => {
        if (err instanceof ApiError)
          return c.json({ error: err.errorCode }, err.statusCode)
        return c.json({ error: 'Internal Server Error' }, 500)
      })
      app.use('*', async (c, next) => {
        c.set('user', testUser as any)
        await next()
      })
      app.route('/api/v1/stripe', routes)

      const res = await app.request('/api/v1/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 500 }),
      })
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
      const routes = createStripeRoutes(
        createMockFluxService(),
        createMockStripeService(),
        createMockBillingService(),
        createMockConfigKV(),
        { ...testEnv, STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '' } as any,
      )
      const app = new Hono<HonoEnv>()
      app.onError((err, c) => {
        if (err instanceof ApiError)
          return c.json({ error: err.errorCode }, err.statusCode)
        return c.json({ error: 'Internal Server Error' }, 500)
      })
      app.route('/api/v1/stripe', routes)

      const res = await app.request('/api/v1/stripe/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': 'test_sig' },
        body: '{}',
      })
      expect(res.status).toBe(503)
    })
  })
})
