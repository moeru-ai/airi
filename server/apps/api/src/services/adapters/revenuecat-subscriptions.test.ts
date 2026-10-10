import type { CapacitorPeriod } from '../domain/billing/billing-service'
import type { ConfigDefinitions, ConfigKVService } from './config-kv'
import type { SubscriberEntitlement } from './revenuecat-subscriber'

import { describe, expect, it, vi } from 'vitest'

import { createRevenuecatSubscriptionSync } from './revenuecat-subscriptions'

const starterCapacitors: ConfigDefinitions['REVENUECAT_CAPACITORS'] = {
  rc_go_monthly: { entitlementId: 'airi_go', quota: 2000 },
  rc_plus_monthly: { entitlementId: 'airi_plus', quota: 5000 },
}

function createConfigKV(capacitors: ConfigDefinitions['REVENUECAT_CAPACITORS'] | null = starterCapacitors): ConfigKVService {
  return {
    getOptional: vi.fn(async () => capacitors),
    getOrThrow: vi.fn(),
    get: vi.fn(),
    refresh: vi.fn(),
    invalidateCache: vi.fn(),
  } as ConfigKVService
}

const future = new Date(Date.now() + 86_400_000)
const past = new Date(Date.now() - 86_400_000)

const goEntitlement: SubscriberEntitlement = {
  entitlementId: 'airi_go',
  productId: 'rc_go_monthly',
  purchasedAt: new Date('2026-10-01T00:00:00.000Z'),
  accessUntil: future,
}

/** Runs the resolver as the wallet does and returns the period that it selects. */
async function reconcile(entitlements: SubscriberEntitlement[], configKV = createConfigKV()) {
  const synced: (CapacitorPeriod | null)[] = []
  const fetchEntitlements = vi.fn(async () => entitlements)
  const sync = createRevenuecatSubscriptionSync(
    {
      syncCapacitor: async (_userId, resolve) => {
        const period = await resolve()
        synced.push(period)
        return period
      },
    },
    configKV,
    { fetchEntitlements },
  )
  await sync.reconcile('user-1')
  return { synced, fetchEntitlements }
}

describe('revenuecat subscription sync', () => {
  it('syncs the active capacitor as a capacitor period', async () => {
    const { synced, fetchEntitlements } = await reconcile([goEntitlement])

    expect(fetchEntitlements).toHaveBeenCalledWith('user-1')
    expect(synced).toEqual([{
      quota: 2000,
      periodStart: goEntitlement.purchasedAt,
      expiresAt: future,
    }])
  })

  it('syncs no period when the entitlement is expired', async () => {
    const { synced } = await reconcile([{ ...goEntitlement, accessUntil: past }])
    expect(synced).toEqual([null])
  })

  it('syncs no period when the entitlement has no expiry', async () => {
    const { synced } = await reconcile([{ ...goEntitlement, accessUntil: null }])
    expect(synced).toEqual([null])
  })

  it('selects the latest purchase when two capacitors are active', async () => {
    const { synced } = await reconcile([
      goEntitlement,
      {
        entitlementId: 'airi_plus',
        productId: 'rc_plus_monthly',
        purchasedAt: new Date('2026-10-15T00:00:00.000Z'),
        accessUntil: future,
      },
    ])
    expect(synced).toMatchObject([{ quota: 5000 }])
  })

  it('ignores a product that has no capacitor', async () => {
    const { synced } = await reconcile([{ ...goEntitlement, productId: 'unknown' }])
    expect(synced).toEqual([null])
  })

  it('ignores an entitlement that does not match the capacitor', async () => {
    const { synced } = await reconcile([{ ...goEntitlement, entitlementId: 'other' }])
    expect(synced).toEqual([null])
  })

  it('leaves the wallet as it is when the capacitor map is empty', async () => {
    const { synced, fetchEntitlements } = await reconcile([goEntitlement], createConfigKV({}))
    expect(synced).toEqual([])
    expect(fetchEntitlements).not.toHaveBeenCalled()
  })

  it('leaves the wallet as it is when no capacitors are configured', async () => {
    const { synced, fetchEntitlements } = await reconcile([goEntitlement], createConfigKV(null))
    expect(synced).toEqual([])
    expect(fetchEntitlements).not.toHaveBeenCalled()
  })
})
