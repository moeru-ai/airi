import type { PlanPeriod } from '../domain/subscriptions'
import type { ConfigDefinitions, ConfigKVService } from './config-kv'
import type { SubscriberEntitlement } from './revenuecat-subscriber'

import { describe, expect, it, vi } from 'vitest'

import { createRevenuecatSubscriptionSync } from './revenuecat-subscriptions'

const starterPlans: ConfigDefinitions['REVENUECAT_SUBSCRIPTION_PLANS'] = {
  rc_go_monthly: { entitlementId: 'airi_go', quotaCredit: 2000 },
  rc_plus_monthly: { entitlementId: 'airi_plus', quotaCredit: 5000 },
}

function createConfigKV(plans: ConfigDefinitions['REVENUECAT_SUBSCRIPTION_PLANS'] | null = starterPlans): ConfigKVService {
  return {
    getOptional: vi.fn(async () => plans),
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

/** Runs the resolver as the ledger does and returns the period that it selects. */
async function reconcile(entitlements: SubscriberEntitlement[], configKV = createConfigKV()) {
  const synced: (PlanPeriod | null)[] = []
  const fetchEntitlements = vi.fn(async () => entitlements)
  const sync = createRevenuecatSubscriptionSync(
    { syncPeriod: async (_userId, resolve) => { synced.push(await resolve()) } },
    configKV,
    { fetchEntitlements },
  )
  await sync.reconcile('user-1')
  return { synced, fetchEntitlements }
}

describe('revenuecat subscription sync', () => {
  it('syncs the active plan as a Credit period', async () => {
    const { synced, fetchEntitlements } = await reconcile([goEntitlement])

    expect(fetchEntitlements).toHaveBeenCalledWith('user-1')
    expect(synced).toEqual([{
      entitlementId: 'airi_go',
      grantedCredit: 2000,
      periodStart: goEntitlement.purchasedAt,
      periodEnd: future,
    }])
  })

  it('syncs no period when the entitlement is expired', async () => {
    const { synced } = await reconcile([{ ...goEntitlement, accessUntil: past }])
    expect(synced).toEqual([null])
  })

  it('keeps a plan that does not expire', async () => {
    const { synced } = await reconcile([{ ...goEntitlement, accessUntil: null }])
    expect(synced).toMatchObject([{ entitlementId: 'airi_go', periodEnd: null }])
  })

  it('selects the latest purchase when two plans are active', async () => {
    const { synced } = await reconcile([
      goEntitlement,
      {
        entitlementId: 'airi_plus',
        productId: 'rc_plus_monthly',
        purchasedAt: new Date('2026-10-15T00:00:00.000Z'),
        accessUntil: future,
      },
    ])
    expect(synced).toMatchObject([{ entitlementId: 'airi_plus', grantedCredit: 5000 }])
  })

  it('ignores a product that has no plan', async () => {
    const { synced } = await reconcile([{ ...goEntitlement, productId: 'unknown' }])
    expect(synced).toEqual([null])
  })

  it('ignores an entitlement that does not match the plan', async () => {
    const { synced } = await reconcile([{ ...goEntitlement, entitlementId: 'other' }])
    expect(synced).toEqual([null])
  })

  it('leaves the ledger as it is when no plans are configured', async () => {
    const { synced, fetchEntitlements } = await reconcile([goEntitlement], createConfigKV(null))
    expect(synced).toEqual([])
    expect(fetchEntitlements).not.toHaveBeenCalled()
  })
})
