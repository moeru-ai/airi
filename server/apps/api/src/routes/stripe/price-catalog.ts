import type Redis from 'ioredis'
import type Stripe from 'stripe'

import { useLogger } from '@guiiai/logg'

import { formatPrice } from '../../utils/format-price'
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

export interface StripePackage {
  packKey: string
  // NOTICE: compatibility copy of packKey for previous-version clients.
  stripePriceId: string
  label: string
  defaultCurrency: string
  currencies: Record<string, string>
  recommended: boolean
}

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
      const cachedPrices = await this.getActivePrices(productId)
      const cached = cachedPrices.find(p => p.id === stripePriceId)
      if (cached)
        return cached

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

      await redis.del(PRICES_CACHE_KEY)
      return toCachedPrice(fetched)
    },
  }
}

export async function listStripePackages(catalog: StripePriceCatalog, productId: string): Promise<StripePackage[]> {
  const prices = await catalog.getActivePrices(productId)
  return prices.map((price) => {
    const currencies: Record<string, string> = {
      [price.currency]: formatPrice(price.unitAmount, price.currency),
    }
    for (const [currency, option] of Object.entries(price.currencyOptions))
      currencies[currency] = formatPrice(option.unitAmount, currency)

    return {
      packKey: price.id,
      stripePriceId: price.id,
      label: `${price.metadata.fluxAmount ?? '?'} Flux`,
      defaultCurrency: price.currency,
      currencies,
      recommended: price.metadata.recommended === 'true',
    }
  })
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
      Object.entries(price.currency_options ?? {}).map(([currency, option]) => [currency, { unitAmount: option.unit_amount }]),
    ),
  }
}
