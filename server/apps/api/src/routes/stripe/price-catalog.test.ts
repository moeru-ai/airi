import type { ConfigDefinitions } from '../../services/adapters/config-kv'

import { describe, expect, it, vi } from 'vitest'

import { createTestRedis } from '../../libs/tests/redis'
import { listStripePackages } from './price-catalog'

const starterPack: ConfigDefinitions['FLUX_PACKS'][number] = {
  key: 'starter',
  name: '500 Flux',
  fluxAmount: 500,
  recommended: true,
  processors: { stripe: { priceId: 'price_starter' } },
}

function createStripe(retrieve: ReturnType<typeof vi.fn>) {
  return {
    prices: { retrieve },
  } as never
}

describe('listStripePackages', () => {
  it('lists Stripe prices including extra currencies', async () => {
    const retrieve = vi.fn(async (priceId: string) => ({
      id: priceId,
      currency: 'usd',
      unit_amount: 500,
      currency_options: { jpy: { unit_amount: 500 } },
    }))

    await expect(listStripePackages(createStripe(retrieve), createTestRedis(), [starterPack])).resolves.toEqual([{
      packKey: 'starter',
      stripePriceId: 'price_starter',
      label: '500 Flux',
      defaultCurrency: 'usd',
      currencies: { usd: '$5.00', jpy: '¥500' },
      recommended: true,
    }])
  })

  it('reuses the Stripe price cache for the same price id set', async () => {
    const retrieve = vi.fn(async () => ({
      id: 'price_starter',
      currency: 'usd',
      unit_amount: 500,
      currency_options: {},
    }))
    const redis = createTestRedis()

    await listStripePackages(createStripe(retrieve), redis, [starterPack])
    await listStripePackages(createStripe(retrieve), redis, [starterPack])
    expect(retrieve).toHaveBeenCalledTimes(1)
  })

  it('skips a pack when price lookup fails', async () => {
    const retrieve = vi.fn(async () => {
      throw new Error('no such price')
    })

    await expect(listStripePackages(createStripe(retrieve), createTestRedis(), [starterPack])).resolves.toEqual([])
  })
})

// https://github.com/moeru-ai/airi/pull/2335
it('refreshes a renamed pack without waiting for the price cache', async () => {
  const retrieve = vi.fn(async () => ({ id: 'price_starter', currency: 'usd', unit_amount: 500, currency_options: {} }))
  const redis = createTestRedis()
  await listStripePackages(createStripe(retrieve), redis, [starterPack])
  const items = await listStripePackages(createStripe(retrieve), redis, [{ ...starterPack, key: 'renamed', name: 'New name', recommended: false }])
  expect(items[0]).toMatchObject({ packKey: 'renamed', label: 'New name', recommended: false })
})

it('does not cache a transient lookup failure', async () => {
  const retrieve = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValue({ id: 'price_starter', currency: 'usd', unit_amount: 500, currency_options: {} })
  const redis = createTestRedis()
  await listStripePackages(createStripe(retrieve), redis, [starterPack])
  expect(await listStripePackages(createStripe(retrieve), redis, [starterPack])).toHaveLength(1)
})
