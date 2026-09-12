import type Redis from 'ioredis'
import type Stripe from 'stripe'

import type { ConfigDefinitions } from '../../services/adapters/config-kv'

import { useLogger } from '@guiiai/logg'
import { array, boolean, object, record, safeParse, string } from 'valibot'

import { formatPrice } from '../../utils/format-price'
import { redisKeyFrom } from '../../utils/redis-keys'

const logger = useLogger('stripe.catalog')

/** Display prices stay 5 minutes old. */
const PRICES_CACHE_TTL_SEC = 5 * 60
const PRICES_CACHE_KEY = redisKeyFrom('cache', 'stripe', 'prices', 'v2')

const packageSchema = object({
  packKey: string(),
  stripePriceId: string(),
  label: string(),
  defaultCurrency: string(),
  currencies: record(string(), string()),
  recommended: boolean(),
})
const cacheSchema = object({ cacheKey: string(), items: array(packageSchema) })

export async function listStripePackages(
  stripe: Stripe | null,
  redis: Redis,
  packs: ConfigDefinitions['FLUX_PACKS'],
) {
  if (!stripe)
    return []

  const cacheKey = JSON.stringify(packs)
  const cached = await redis.get(PRICES_CACHE_KEY)
  if (cached) {
    try {
      const parsed = safeParse(cacheSchema, JSON.parse(cached))
      if (parsed.success && parsed.output.cacheKey === cacheKey)
        return parsed.output.items
    }
    catch { /* corrupted cache, refetch */ }
  }

  const items = []
  let complete = true
  for (const pack of packs) {
    const priceId = pack.processors.stripe?.priceId
    if (!priceId)
      continue

    let price: Stripe.Price
    try {
      price = await stripe.prices.retrieve(priceId, { expand: ['currency_options'] })
    }
    catch (error) {
      complete = false
      logger.withError(error).withFields({ priceId, packKey: pack.key }).warn('Stripe price lookup skipped')
      continue
    }

    const currencies: Record<string, string> = {
      [price.currency]: formatPrice(price.unit_amount, price.currency),
    }
    for (const [currency, option] of Object.entries(price.currency_options ?? {})) {
      currencies[currency] = formatPrice(option.unit_amount, currency)
    }

    items.push({
      packKey: pack.key,
      stripePriceId: priceId,
      label: pack.name,
      defaultCurrency: price.currency,
      currencies,
      recommended: pack.recommended,
    })
  }

  // A transient provider failure must not hide a pack for the full cache TTL.
  if (complete)
    await redis.set(PRICES_CACHE_KEY, JSON.stringify({ cacheKey, items }), 'EX', PRICES_CACHE_TTL_SEC)
  return items
}
