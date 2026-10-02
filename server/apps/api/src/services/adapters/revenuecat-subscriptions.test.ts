import type { SubscriptionService } from '../domain/subscriptions'
import type { ConfigKVService } from './config-kv'
import type { RevenuecatApiClient } from './revenuecat-api'

import { describe, expect, it, vi } from 'vitest'

import { createRevenuecatSubscriptionSync } from './revenuecat-subscriptions'

function createConfigKV(): ConfigKVService {
  return {
    getOptional: vi.fn(async () => ({
      rc_go_monthly: { entitlementId: 'airi_go', quotaAmount: 2000 },
    })),
    getOrThrow: vi.fn(),
    get: vi.fn(),
    refresh: vi.fn(),
    invalidateCache: vi.fn(),
  } as ConfigKVService
}

function createCore(): SubscriptionService {
  return {
    upsertSubscription: vi.fn(async () => undefined),
    openPeriod: vi.fn(async () => true),
    reconcile: vi.fn(async () => undefined),
    getStatus: vi.fn(),
    consumeQuota: vi.fn(),
    getFallbackPreference: vi.fn(),
    setFallbackPreference: vi.fn(),
    deleteAllForUser: vi.fn(),
  } as unknown as SubscriptionService
}

const baseEvent = {
  id: 'event-1',
  type: 'INITIAL_PURCHASE',
  appUserId: 'user-1',
  entitlementIds: ['airi_go'],
  productId: 'rc_go_monthly',
  store: 'TEST_STORE',
  environment: 'SANDBOX',
  expirationAtMs: Date.now() + 1000,
  purchasedAtMs: Date.now(),
}

describe('revenuecat subscription sync', () => {
  it('translates a purchase into upsert plus period', async () => {
    const core = createCore()
    const sync = createRevenuecatSubscriptionSync(core, createConfigKV(), null)

    expect(await sync.syncEvent(baseEvent)).toEqual({ synced: true })
    expect(core.upsertSubscription).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      entitlementId: 'airi_go',
      status: 'active',
    }))
    expect(core.openPeriod).toHaveBeenCalledWith(expect.objectContaining({
      grantedAmount: 2000,
      eventKey: 'event-1:airi_go',
    }))
  })

  it('syncs status without a period for informative events', async () => {
    const core = createCore()
    const sync = createRevenuecatSubscriptionSync(core, createConfigKV(), null)

    expect(await sync.syncEvent({ ...baseEvent, id: 'event-2', type: 'PRODUCT_CHANGE' }))
      .toEqual({ synced: true })
    expect(core.upsertSubscription).toHaveBeenCalled()
    expect(core.openPeriod).not.toHaveBeenCalled()
  })

  it('acks unknown products without touching the core', async () => {
    const core = createCore()
    const sync = createRevenuecatSubscriptionSync(core, createConfigKV(), null)

    expect(await sync.syncEvent({ ...baseEvent, productId: 'unknown' })).toEqual({ synced: false })
    expect(core.upsertSubscription).not.toHaveBeenCalled()
  })

  it('reconciles with mapped quota and skips when the api is unreachable', async () => {
    const core = createCore()
    const api = {
      enabled: true,
      getActiveEntitlements: vi.fn(async () => [
        { lookupKey: 'airi_go', expiresAtMs: 1790800000000 },
      ]),
    } as unknown as RevenuecatApiClient
    const sync = createRevenuecatSubscriptionSync(core, createConfigKV(), api)

    await sync.reconcile('user-1')
    expect(core.reconcile).toHaveBeenCalledWith('user-1', [{
      entitlementId: 'airi_go',
      active: true,
      expiresAt: new Date(1790800000000),
      quotaAmount: 2000,
    }])

    const unreachable = createRevenuecatSubscriptionSync(core, createConfigKV(), {
      enabled: true,
      getActiveEntitlements: vi.fn(async () => null),
    } as unknown as RevenuecatApiClient)
    await unreachable.reconcile('user-1')
    expect(core.reconcile).toHaveBeenCalledTimes(1)
  })
})
