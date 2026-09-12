import type Stripe from 'stripe'

import { describe, expect, it, vi } from 'vitest'

import { createTestRedis } from '../../libs/tests/redis'
import { createStripePriceCatalog, listStripePackages } from './price-catalog'

const productId = 'prod_flux'

function createStripe(overrides: {
  list?: ReturnType<typeof vi.fn>
  retrieve?: ReturnType<typeof vi.fn>
} = {}) {
  return {
    prices: {
      list: overrides.list ?? vi.fn(async () => ({ data: [] })),
      retrieve: overrides.retrieve ?? vi.fn(),
    },
  } as unknown as Stripe
}

function listedPrice(overrides: Partial<Stripe.Price> = {}): Stripe.Price {
  return {
    id: 'price_starter',
    object: 'price',
    active: true,
    currency: 'usd',
    unit_amount: 500,
    product: productId,
    metadata: { fluxAmount: '500', recommended: 'true' },
    currency_options: { jpy: { unit_amount: 500 } },
    ...overrides,
  } as Stripe.Price
}

describe('listStripePackages', () => {
  it('lists Stripe product prices including extra currencies', async () => {
    const catalog = createStripePriceCatalog(
      createStripe({
        list: vi.fn(async () => ({ data: [listedPrice()] })),
      }),
      createTestRedis(),
    )

    await expect(listStripePackages(catalog, productId)).resolves.toEqual([{
      packKey: 'price_starter',
      stripePriceId: 'price_starter',
      label: '500 Flux',
      defaultCurrency: 'usd',
      currencies: { usd: '$5.00', jpy: '¥500' },
      recommended: true,
    }])
  })

  it('reuses the Stripe price cache for the same product', async () => {
    const list = vi.fn(async () => ({ data: [listedPrice()] }))
    const catalog = createStripePriceCatalog(createStripe({ list }), createTestRedis())

    await listStripePackages(catalog, productId)
    await listStripePackages(catalog, productId)
    expect(list).toHaveBeenCalledTimes(1)
  })

  it('returns no packages when Stripe price list fails', async () => {
    const catalog = createStripePriceCatalog(
      createStripe({
        list: vi.fn(async () => {
          throw new Error('timeout')
        }),
      }),
      createTestRedis(),
    )

    await expect(listStripePackages(catalog, productId)).resolves.toEqual([])
  })

  it('does not cache a Stripe list failure', async () => {
    const list = vi.fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue({ data: [listedPrice()] })
    const catalog = createStripePriceCatalog(createStripe({ list }), createTestRedis())

    await expect(listStripePackages(catalog, productId)).resolves.toEqual([])
    expect(await listStripePackages(catalog, productId)).toHaveLength(1)
  })
})

describe('findActivePrice', () => {
  it('retrieves a newly created price that is missing from cache', async () => {
    const catalog = createStripePriceCatalog(
      createStripe({
        list: vi.fn(async () => ({ data: [] })),
        retrieve: vi.fn(async () => listedPrice({ id: 'price_new' })),
      }),
      createTestRedis(),
    )

    await expect(catalog.findActivePrice(productId, 'price_new')).resolves.toMatchObject({
      id: 'price_new',
      metadata: { fluxAmount: '500', recommended: 'true' },
    })
  })

  it('rejects a price that belongs to another product', async () => {
    const catalog = createStripePriceCatalog(
      createStripe({
        list: vi.fn(async () => ({ data: [] })),
        retrieve: vi.fn(async () => listedPrice({ product: 'prod_other' })),
      }),
      createTestRedis(),
    )

    await expect(catalog.findActivePrice(productId, 'price_starter')).resolves.toBeNull()
  })
})
