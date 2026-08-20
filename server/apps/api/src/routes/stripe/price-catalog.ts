import type Redis from 'ioredis'
import type Stripe from 'stripe'

import type { ConfigKVService } from '../../services/adapters/config-kv'
import type { FluxPack } from '../../services/domain/payment'

import { useLogger } from '@guiiai/logg'

import { redisKeyFrom } from '../../utils/redis-keys'

const logger = useLogger('stripe.catalog')

/** Display prices stay 5 minutes old. Same TTL as the previous Stripe price catalog. */
const PRICES_CACHE_TTL_SEC = 5 * 60
const PRICES_CACHE_KEY = redisKeyFrom('cache', 'stripe', 'prices')

export interface StripePackListItem {
  packKey: string
  stripePriceId?: string
  label: string
  defaultCurrency: string
  currencies: Record<string, string>
  recommended: boolean
}

export async function loadFluxPacks(configKV: ConfigKVService): Promise<FluxPack[]> {
  const packs = await configKV.getOptional('FLUX_PACKS') ?? []
  return packs.map(pack => ({
    key: pack.key,
    name: pack.name,
    fluxAmount: pack.fluxAmount,
    recommended: pack.recommended ?? false,
    providers: pack.providers ?? {},
  }))
}

export async function listStripePackages(
  stripe: Stripe | null,
  redis: Redis,
  packs: FluxPack[],
): Promise<StripePackListItem[]> {
  if (!stripe)
    return []

  const cacheKey = packs.map(pack => pack.providers.stripe?.priceId ?? '').join(',')
  const cached = await redis.get(PRICES_CACHE_KEY)
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as { cacheKey: string, items: StripePackListItem[] }
      if (parsed.cacheKey === cacheKey)
        return parsed.items
    }
    catch { /* corrupted cache, refetch */ }
  }

  const items: StripePackListItem[] = []
  for (const pack of packs) {
    const priceId = pack.providers.stripe?.priceId
    if (!priceId)
      continue

    let price: Stripe.Price
    try {
      price = await stripe.prices.retrieve(priceId, { expand: ['currency_options'] })
    }
    catch (error) {
      logger.withError(error).withFields({ priceId, packKey: pack.key }).warn('Stripe price lookup skipped')
      continue
    }

    const currencies: Record<string, string> = {}
    currencies[price.currency] = formatPrice(price.unit_amount, price.currency)
    for (const [currency, option] of Object.entries(price.currency_options ?? {})) {
      currencies[currency] = formatPrice(option.unit_amount, currency)
    }

    items.push({
      packKey: pack.key,
      stripePriceId: price.id,
      label: pack.name,
      defaultCurrency: price.currency,
      currencies,
      recommended: pack.recommended,
    })
  }

  await redis.set(PRICES_CACHE_KEY, JSON.stringify({ cacheKey, items }), 'EX', PRICES_CACHE_TTL_SEC)
  return items
}

/**
 * Formats a Stripe smallest-unit amount into a display price string.
 *
 * @example
 * formatPrice(300, 'usd')
 * // => '$3.00'
 */
function formatPrice(unitAmount: number | null, currency: string): string {
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
