import type { Database } from '../../libs/db'
import type { ConfigKVService } from '../../services/adapters/config-kv'
import type { CachedPrice, StripePriceCatalog } from './price-catalog'

import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { createTestRedis } from '../../libs/tests/redis'
import { createBillingService } from '../../services/domain/billing/billing-service'
import { createPaymentService } from '../../services/domain/payment'
import { createCheckoutOperation } from './operations/checkout'

import * as schema from '../../schemas'

const productId = 'prod_flux'
const starterPrice: CachedPrice = {
  id: 'price_starter',
  unitAmount: 500,
  currency: 'usd',
  product: productId,
  active: true,
  metadata: { fluxAmount: '500' },
  currencyOptions: {},
}

const testEnv = {
  STRIPE_SECRET_KEY: 'sk_test_fake',
  STRIPE_WEBHOOK_SECRET: 'whsec_test_fake',
  API_SERVER_URL: 'http://localhost:8787',
  WEB_APP_URL: 'https://airi.moeru.ai',
  ADDITIONAL_TRUSTED_ORIGINS: [],
} as never

const testUser = { id: 'user-pay-1', name: 'Pay User', email: 'pay@example.com' }

function createProductConfigKV(): ConfigKVService {
  return {
    getOptional: vi.fn(async (key: string) => {
      if (key === 'STRIPE_FLUX_PRODUCT_ID')
        return productId
      return null
    }),
    getOrThrow: vi.fn(),
    get: vi.fn(),
    refresh: vi.fn(),
    invalidateCache: vi.fn(),
  } as ConfigKVService
}

function createCatalog(price: CachedPrice | null = starterPrice): StripePriceCatalog {
  return {
    getActivePrices: vi.fn(async () => price ? [price] : []),
    findActivePrice: vi.fn(async (_productId: string, stripePriceId: string) => {
      if (price && price.id === stripePriceId)
        return price
      return null
    }),
  }
}

function createCheckout(
  payment: ReturnType<typeof createPaymentService>,
  stripe: { checkout: { sessions: { create: ReturnType<typeof vi.fn> } } },
  catalog: StripePriceCatalog = createCatalog(),
  productEventService: { track: ReturnType<typeof vi.fn> } | null = null,
) {
  return createCheckoutOperation(
    payment,
    stripe as never,
    catalog,
    createProductConfigKV(),
    testEnv,
    null,
    productEventService as never,
  )
}

describe('stripe checkout', () => {
  let db: Database
  let payment: ReturnType<typeof createPaymentService>

  beforeAll(async () => {
    db = await mockDB(schema)
    await db.insert(schema.user).values({
      id: 'user-pay-1',
      name: 'Pay User',
      email: 'pay@example.com',
    })
  })

  beforeEach(async () => {
    const redis = createTestRedis()
    const billing = createBillingService(db, redis, createProductConfigKV())
    payment = createPaymentService(db, billing)

    await db.delete(schema.fluxTransaction).where(eq(schema.fluxTransaction.userId, 'user-pay-1'))
    await db.delete(schema.userFlux).where(eq(schema.userFlux.userId, 'user-pay-1'))
    await db.delete(schema.paymentOrder).where(eq(schema.paymentOrder.userId, 'user-pay-1'))
    await db.delete(schema.paymentCustomer).where(eq(schema.paymentCustomer.userId, 'user-pay-1'))
  })

  it('inserts a pending order then creates a Checkout Session', async () => {
    const create = vi.fn(async (params: { metadata?: Record<string, string> }) => {
      const [order] = await db.select().from(schema.paymentOrder).where(eq(schema.paymentOrder.userId, 'user-pay-1'))
      expect(order?.status).toBe('pending')
      expect(order?.processorOrderId).toBeNull()
      expect(order?.packKey).toBe('price_starter')
      expect(order?.fluxAmount).toBe(500)
      expect(params.metadata?.payment_order_id).toBe(order?.id)
      expect(params.metadata?.stripePriceId).toBe('price_starter')
      expect(params.metadata?.fluxAmount).toBe('500')

      return {
        id: 'cs_test_1',
        url: 'https://checkout.stripe.test/cs_test_1',
        amount_total: 500,
        currency: 'usd',
      }
    })

    const checkout = createCheckout(payment, { checkout: { sessions: { create } } })

    const result = await checkout(
      testUser,
      { stripePriceId: 'price_starter', currency: 'usd' },
      new Request('http://localhost/api/v1/stripe/checkout'),
    )

    expect(result).toEqual({ url: 'https://checkout.stripe.test/cs_test_1' })

    const [order] = await db.select().from(schema.paymentOrder).where(eq(schema.paymentOrder.userId, 'user-pay-1'))
    expect(order?.status).toBe('pending')
    expect(order?.processorOrderId).toBe('cs_test_1')
    expect(order?.amount).toBe(500)
    expect(order?.currency).toBe('usd')
  })

  it('rejects a price that is not on the configured product', async () => {
    const checkout = createCheckout(
      payment,
      { checkout: { sessions: { create: vi.fn() } } },
      createCatalog(null),
    )

    await expect(checkout(
      testUser,
      { stripePriceId: 'price_other' },
      new Request('http://localhost/api/v1/stripe/checkout'),
    )).rejects.toMatchObject({
      statusCode: 400,
      errorCode: 'INVALID_PACKAGE',
    })
  })

  it('rejects a price without fluxAmount metadata', async () => {
    const checkout = createCheckout(
      payment,
      { checkout: { sessions: { create: vi.fn() } } },
      createCatalog({ ...starterPrice, metadata: {} }),
    )

    await expect(checkout(
      testUser,
      { stripePriceId: 'price_starter' },
      new Request('http://localhost/api/v1/stripe/checkout'),
    )).rejects.toMatchObject({
      statusCode: 400,
      errorCode: 'INVALID_PACKAGE',
    })
    expect(await db.select().from(schema.paymentOrder)).toHaveLength(0)
  })

  it('credits Flux when settle runs before the session id is bound', async () => {
    const create = vi.fn(async (params: { metadata?: Record<string, string> }) => {
      const paymentOrderId = params.metadata?.payment_order_id
      expect(paymentOrderId).toBeTruthy()

      const result = await payment.settle({
        kind: 'claim',
        processor: 'stripe',
        paymentOrderId: paymentOrderId!,
        processorOrderId: 'cs_test_race',
        status: 'paid',
        customerId: 'cus_test',
      })
      expect(result.applied).toBe(true)

      return {
        id: 'cs_test_race',
        url: 'https://checkout.stripe.test/cs_test_race',
        amount_total: 500,
        currency: 'usd',
      }
    })

    const checkout = createCheckout(payment, { checkout: { sessions: { create } } })

    await checkout(
      testUser,
      { stripePriceId: 'price_starter' },
      new Request('http://localhost/api/v1/stripe/checkout'),
    )

    const [flux] = await db.select().from(schema.userFlux).where(eq(schema.userFlux.userId, 'user-pay-1'))
    expect(flux?.flux).toBe(500)

    const [order] = await db.select().from(schema.paymentOrder).where(eq(schema.paymentOrder.userId, 'user-pay-1'))
    expect(order?.status).toBe('paid')
    expect(order?.processorOrderId).toBe('cs_test_race')
  })

  it('stores browser OpenPanel identity in Checkout Session metadata', async () => {
    const create = vi.fn(async () => ({
      id: 'cs_test_ph',
      url: 'https://checkout.stripe.test/cs_test_ph',
      amount_total: 500,
      currency: 'usd',
    }))
    const productEventService = { track: vi.fn() }

    const checkout = createCheckout(payment, { checkout: { sessions: { create } } }, createCatalog(), productEventService)

    await checkout(
      testUser,
      { stripePriceId: 'price_starter' },
      new Request('http://localhost/api/v1/stripe/checkout', {
        headers: {
          'x-openpanel-device-id': 'anon-browser-1',
          'x-openpanel-session-id': 'ph-session-1',
        },
      }),
    )

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        openpanelDeviceId: 'anon-browser-1',
        openpanelSessionId: 'ph-session-1',
      }),
    }))
    expect(productEventService.track).toHaveBeenCalledWith(expect.objectContaining({
      action: 'checkout_started',
      metadata: expect.objectContaining({
        openpanel_device_id: 'anon-browser-1',
        stripe_price_id: 'price_starter',
      }),
    }))
  })

  it('reuses the live Stripe customer on the Checkout Session', async () => {
    await db.insert(schema.paymentCustomer).values({
      userId: 'user-pay-1',
      processor: 'stripe',
      customerId: 'cus_existing',
    })

    const create = vi.fn(async (params: { customer?: string, customer_email?: string }) => {
      expect(params.customer).toBe('cus_existing')
      expect(params.customer_email).toBeUndefined()
      return {
        id: 'cs_test_customer',
        url: 'https://checkout.stripe.test/cs_test_customer',
        amount_total: 500,
        currency: 'usd',
      }
    })

    const checkout = createCheckout(payment, { checkout: { sessions: { create } } })

    await checkout(
      testUser,
      { stripePriceId: 'price_starter' },
      new Request('http://localhost/api/v1/stripe/checkout'),
    )

    expect(create).toHaveBeenCalled()
  })

  it('abandons the pending order when Checkout Session create fails', async () => {
    const create = vi.fn(async () => {
      throw new Error('stripe down')
    })
    const checkout = createCheckout(payment, { checkout: { sessions: { create } } })

    await expect(checkout(
      testUser,
      { stripePriceId: 'price_starter' },
      new Request('http://localhost/api/v1/stripe/checkout'),
    )).rejects.toThrow('stripe down')

    const [order] = await db.select().from(schema.paymentOrder).where(eq(schema.paymentOrder.userId, 'user-pay-1'))
    expect(order?.status).toBe('canceled')
    expect(order?.processorOrderId).toBeNull()
  })

  it('abandons the pending order when Checkout Session has no URL', async () => {
    const create = vi.fn(async () => ({
      id: 'cs_test_nourl',
      url: null,
      amount_total: 500,
      currency: 'usd',
    }))
    const checkout = createCheckout(payment, { checkout: { sessions: { create } } })

    await expect(checkout(
      testUser,
      { stripePriceId: 'price_starter' },
      new Request('http://localhost/api/v1/stripe/checkout'),
    )).rejects.toMatchObject({
      statusCode: 503,
      errorCode: 'STRIPE_CHECKOUT_URL_MISSING',
    })

    const [order] = await db.select().from(schema.paymentOrder).where(eq(schema.paymentOrder.userId, 'user-pay-1'))
    expect(order?.status).toBe('canceled')
  })
})
