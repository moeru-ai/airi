import type Redis from 'ioredis'
import type Stripe from 'stripe'

import { useLogger } from '@guiiai/logg'

import { redisKeyFrom } from '../../utils/redis-keys'

const logger = useLogger('stripe')

const PRICES_CACHE_KEY = redisKeyFrom('cache', 'stripe', 'prices')
const PRICES_CACHE_TTL_SEC = 5 * 60

interface CachedCurrencyOption {
  unitAmount: number | null
}

export interface CachedPrice {
  id: string
  unitAmount: number | null
  currency: string
  product: string
  active: boolean
  metadata: Record<string, string>
  currencyOptions: Record<string, CachedCurrencyOption>
}

export interface StripePriceCatalog {
  getActivePrices: (productId: string) => Promise<CachedPrice[]>
  findActivePrice: (productId: string, stripePriceId: string) => Promise<CachedPrice | null>
}

/**
 * Creates a Stripe price catalog backed by Redis.
 *
 * Use when:
 * - Listing public Flux packages.
 * - Validating checkout price ids before creating Stripe sessions.
 *
 * Expects:
 * - A configured Stripe client and Redis connection.
 *
 * Returns:
 * - Cached active prices for a single configured product.
 */
export function createStripePriceCatalog(stripe: Stripe, redis: Redis): StripePriceCatalog {
  return {
    async getActivePrices(productId: string): Promise<CachedPrice[]> {
      const cached = await redis.get(PRICES_CACHE_KEY)
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as { productId: string, prices: CachedPrice[] }
          if (parsed.productId === productId)
            return parsed.prices
        }
        catch { /* corrupted cache, refetch */ }
      }

      let result: Stripe.ApiList<Stripe.Price>
      try {
        result = await stripe.prices.list({ product: productId, active: true, expand: ['data.currency_options'] })
      }
      catch (err) {
        logger.withError(err).warn('Failed to fetch prices from Stripe')
        return []
      }

      const prices = result.data
        .sort((a, b) => (a.unit_amount ?? 0) - (b.unit_amount ?? 0))
        .map(toCachedPrice)

      await redis.set(PRICES_CACHE_KEY, JSON.stringify({ productId, prices }), 'EX', PRICES_CACHE_TTL_SEC)
      return prices
    },

    async findActivePrice(productId: string, stripePriceId: string): Promise<CachedPrice | null> {
      // Validate against cached prices first, fall back to direct Stripe API.
      const cachedPrices = await this.getActivePrices(productId)
      const cached = cachedPrices.find(p => p.id === stripePriceId)
      if (cached)
        return cached

      // Cache miss — price may have just been created.
      let fetched: Stripe.Price
      try {
        fetched = await stripe.prices.retrieve(stripePriceId)
      }
      catch {
        return null
      }

      const fetchedProductId = typeof fetched.product === 'string' ? fetched.product : fetched.product.id
      if (!fetched.active || fetchedProductId !== productId)
        return null

      // Invalidate cache so all instances pick up the new price.
      await redis.del(PRICES_CACHE_KEY)
      return toCachedPrice(fetched)
    },
  }
}

function toCachedPrice(price: Stripe.Price): CachedPrice {
  return {
    id: price.id,
    unitAmount: price.unit_amount,
    currency: price.currency,
    product: typeof price.product === 'string' ? price.product : price.product.id,
    active: price.active,
    metadata: price.metadata,
    currencyOptions: Object.fromEntries(
      Object.entries(price.currency_options ?? {}).map(([cur, opt]) => [cur, { unitAmount: opt.unit_amount }]),
    ),
  }
}

/**
 * Format Stripe smallest-unit amount into a human-readable price string.
 *
 * Before:
 * - `300, "usd"`
 * - `500, "jpy"`
 *
 * After:
 * - `"$3.00"`
 * - `"¥500"`
 */
export function formatPrice(unitAmount: number | null, currency: string): string {
  if (unitAmount == null)
    return currency.toUpperCase()

  try {
    const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency })
    const fractionDigits = formatter.resolvedOptions().minimumFractionDigits ?? 2
    const amount = unitAmount / (10 ** fractionDigits)
    return formatter.format(amount)
  }
  catch {
    return `${unitAmount / 100} ${currency.toUpperCase()}`
  }
}
