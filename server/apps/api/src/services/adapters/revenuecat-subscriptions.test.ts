import type { SubscriptionService } from '../domain/subscriptions'
import type { ConfigKVService } from './config-kv'

import { describe, expect, it, vi } from 'vitest'

import { createRevenuecatSubscriptionSync } from './revenuecat-subscriptions'

function createConfigKV(): ConfigKVService {
  return {
    getOptional: vi.fn(async () => ({
      rc_go_monthly: { entitlementId: 'airi_go', quotaCredit: 2000 },
    })),
    getOrThrow: vi.fn(),
    get: vi.fn(),
    refresh: vi.fn(),
    invalidateCache: vi.fn(),
  } as ConfigKVService
}

function createCore(): SubscriptionService {
  return {
    hasEvent: vi.fn(),
    recordEvent: vi.fn(),
    openPeriod: vi.fn(async () => true),
    getStatus: vi.fn(),
    spendableMicro: vi.fn(),
    debitCredits: vi.fn(),
    getFallbackPreference: vi.fn(),
    setFallbackPreference: vi.fn(),
    deleteAllForUser: vi.fn(),
  } as SubscriptionService
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
  it('grants a period for a purchase', async () => {
    const core = createCore()
    const sync = createRevenuecatSubscriptionSync(core, createConfigKV())

    expect(await sync.syncEvent(baseEvent)).toEqual({ synced: true })
    expect(core.openPeriod).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      entitlementId: 'airi_go',
      grantedCredit: 2000,
      eventKey: 'event-1:airi_go',
    }))
  })

  it('does not grant for a cancellation', async () => {
    const core = createCore()
    const sync = createRevenuecatSubscriptionSync(core, createConfigKV())

    expect(await sync.syncEvent({ ...baseEvent, id: 'event-2', type: 'CANCELLATION' }))
      .toEqual({ synced: false })
    expect(core.openPeriod).not.toHaveBeenCalled()
  })

  it('grants a period on product change', async () => {
    const core = createCore()
    const sync = createRevenuecatSubscriptionSync(core, createConfigKV())

    expect(await sync.syncEvent({ ...baseEvent, id: 'event-3', type: 'PRODUCT_CHANGE' }))
      .toEqual({ synced: true })
    expect(core.openPeriod).toHaveBeenCalledWith(expect.objectContaining({
      grantedCredit: 2000,
      eventKey: 'event-3:airi_go',
    }))
  })

  it('does not grant for uncancellation or an extension', async () => {
    const core = createCore()
    const sync = createRevenuecatSubscriptionSync(core, createConfigKV())

    expect(await sync.syncEvent({ ...baseEvent, id: 'event-4', type: 'UNCANCELLATION' }))
      .toEqual({ synced: false })
    expect(await sync.syncEvent({ ...baseEvent, id: 'event-5', type: 'SUBSCRIPTION_EXTENDED' }))
      .toEqual({ synced: false })
    expect(core.openPeriod).not.toHaveBeenCalled()
  })

  it('acks unknown products without a grant', async () => {
    const core = createCore()
    const sync = createRevenuecatSubscriptionSync(core, createConfigKV())

    expect(await sync.syncEvent({ ...baseEvent, productId: 'unknown' })).toEqual({ synced: false })
    expect(core.openPeriod).not.toHaveBeenCalled()
  })
})
