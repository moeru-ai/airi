import type { CapacitorPeriod } from '../domain/billing/billing-service'
import type { ConfigDefinitions, ConfigKVService } from './config-kv'
import type { SubscriberEntitlement } from './revenuecat-subscriber'

import { describe, expect, it, vi } from 'vitest'

import { createConfigKVService } from './config-kv'
import { createRevenuecatSubscriptionSync } from './revenuecat-subscriptions'

const starterCapacitors: ConfigDefinitions['REVENUECAT_CAPACITORS'] = {
  rc_go_monthly: { entitlementId: 'airi_go', quota: 2000 },
  rc_plus_monthly: { entitlementId: 'airi_plus', quota: 5000 },
}

function createConfigKV(
  capacitors: ConfigDefinitions['REVENUECAT_CAPACITORS'] | null = starterCapacitors,
  resetInterval: ConfigDefinitions['CAPACITOR_RESET_INTERVAL'] | null = null,
): ConfigKVService {
  const values = new Map<string, string>()
  if (capacitors)
    values.set('REVENUECAT_CAPACITORS', JSON.stringify(capacitors))
  if (resetInterval)
    values.set('CAPACITOR_RESET_INTERVAL', JSON.stringify(resetInterval))
  return createConfigKVService({
    getRaw: vi.fn(async key => values.get(key) ?? null),
    getFreshRaw: vi.fn(async key => values.get(key) ?? null),
    invalidateCache: vi.fn(async () => {}),
  })
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

  it('syncs a promotional entitlement with the quota of its products', async () => {
    const promotional = { ...goEntitlement, entitlementId: 'airi_plus', productId: null }
    const { synced } = await reconcile([promotional])
    expect(synced).toEqual([{ quota: 5000, periodStart: promotional.purchasedAt, expiresAt: future }])
  })

  it('selects a later promotional entitlement over a paid capacitor', async () => {
    const { synced } = await reconcile([
      goEntitlement,
      { entitlementId: 'airi_plus', productId: null, purchasedAt: new Date('2026-10-20T00:00:00.000Z'), accessUntil: future },
    ])
    expect(synced).toMatchObject([{ quota: 5000 }])
  })

  it('syncs one quota when two products of the promotional entitlement share it', async () => {
    const configKV = createConfigKV({ ...starterCapacitors, rc_go_web_monthly: { entitlementId: 'airi_go', quota: 2000 } })
    const { synced } = await reconcile([{ ...goEntitlement, productId: null }], configKV)
    expect(synced).toMatchObject([{ quota: 2000 }])
  })

  it('syncs no period when the products of the promotional entitlement have different quotas', async () => {
    const configKV = createConfigKV({ ...starterCapacitors, rc_go_yearly: { entitlementId: 'airi_go', quota: 24000 } })
    const { synced } = await reconcile([{ ...goEntitlement, productId: null }], configKV)
    expect(synced).toEqual([null])
  })

  it('syncs no period when no product grants the promotional entitlement', async () => {
    const { synced } = await reconcile([{ ...goEntitlement, entitlementId: 'other', productId: null }])
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

describe('revenuecat capacitor catalog', () => {
  function createCatalog(configKV = createConfigKV()) {
    const fetchEntitlements = vi.fn(async () => [])
    const syncCapacitor = vi.fn(async () => null)
    const sync = createRevenuecatSubscriptionSync({ syncCapacitor }, configKV, { fetchEntitlements })
    return { ...sync, fetchEntitlements, syncCapacitor }
  }

  it.each(['day', 'week'] as const)('lists product quotas with the %s reset interval', async (resetInterval) => {
    const catalog = createCatalog(createConfigKV(starterCapacitors, resetInterval))

    expect(await catalog.listCapacitors()).toEqual({
      capacitors: [
        { productId: 'rc_go_monthly', quota: 2000 },
        { productId: 'rc_plus_monthly', quota: 5000 },
      ],
      resetInterval,
    })
    expect(catalog.fetchEntitlements).not.toHaveBeenCalled()
    expect(catalog.syncCapacitor).not.toHaveBeenCalled()
  })

  it('reports a renewal refill when no reset interval is configured', async () => {
    const catalog = createCatalog()

    expect((await catalog.listCapacitors()).resetInterval).toBeNull()
  })

  it('lists no Capacitors when the mapping is empty', async () => {
    const catalog = createCatalog(createConfigKV({}))

    expect(await catalog.listCapacitors()).toEqual({ capacitors: [], resetInterval: null })
  })

  it('lists no Capacitors when the mapping is unset', async () => {
    const catalog = createCatalog(createConfigKV(null))

    expect(await catalog.listCapacitors()).toEqual({ capacitors: [], resetInterval: null })
  })
})
