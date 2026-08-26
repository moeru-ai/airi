import type Redis from 'ioredis'
import type Stripe from 'stripe'

import { useLogger } from '@guiiai/logg'

import { redisKeyFrom } from '../../utils/redis-keys'

const logger = useLogger('stripe')

const PRICES_CACHE_KEY = redisKeyFrom('cache', 'stripe', 'prices')
const PRICES_CACHE_TTL_SEC = 5 * 60

export interface CachedPrice {
  active: boolean
  currency: string
  currencyOptions: Record<string, CachedCurrencyOption>
  id: string
  metadata: Record<string, string>
  product: string
  unitAmount: null | number
}

export interface StripePriceCatalog {
  findActivePrice: (productId: string, stripePriceId: string) => Promise<CachedPrice | null>
  getActivePrices: (productId: string) => Promise<CachedPrice[]>
}

interface CachedCurrencyOption {
  unitAmount: null | number
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

    async getActivePrices(productId: string): Promise<CachedPrice[]> {
      const cached = await redis.get(PRICES_CACHE_KEY)
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as { prices: CachedPrice[], productId: string }
          if (parsed.productId === productId)
            return parsed.prices
        }
        catch { /* corrupted cache, refetch */ }
      }

      let result: Stripe.ApiList<Stripe.Price>
      try {
        result = await stripe.prices.list({ active: true, expand: ['data.currency_options'], product: productId })
      }
      catch (err) {
        logger.withError(err).warn('Failed to fetch prices from Stripe')
        return []
      }

      const prices = result.data
        .sort((a, b) => (a.unit_amount ?? 0) - (b.unit_amount ?? 0))
        .map(toCachedPrice)

      await redis.set(PRICES_CACHE_KEY, JSON.stringify({ prices, productId }), 'EX', PRICES_CACHE_TTL_SEC)
      return prices
    },
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
export function formatPrice(unitAmount: null | number, currency: string): string {
  if (unitAmount == null)
    return currency.toUpperCase()

  try {
    const formatter = new Intl.NumberFormat('en-US', { currency, style: 'currency' })
    const fractionDigits = formatter.resolvedOptions().minimumFractionDigits ?? 2
    const amount = unitAmount / (10 ** fractionDigits)
    return formatter.format(amount)
  }
  catch {
    return `${unitAmount / 100} ${currency.toUpperCase()}`
  }
}

function toCachedPrice(price: Stripe.Price): CachedPrice {
  return {
    active: price.active,
    currency: price.currency,
    currencyOptions: Object.fromEntries(
      Object.entries(price.currency_options ?? {}).map(([cur, opt]) => [cur, { unitAmount: opt.unit_amount }]),
    ),
    id: price.id,
    metadata: price.metadata,
    product: typeof price.product === 'string' ? price.product : price.product.id,
    unitAmount: price.unit_amount,
  }
}
