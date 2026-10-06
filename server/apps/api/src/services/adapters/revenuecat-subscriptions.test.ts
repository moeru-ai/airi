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
    upsertSubscription: vi.fn(async () => undefined),
    openPeriod: vi.fn(async () => true),
    getStatus: vi.fn(),
    debitCredits: vi.fn(),
    extendPeriod: vi.fn(),
    retireOtherEntitlements: vi.fn(),
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
    const sync = createRevenuecatSubscriptionSync(core, createConfigKV())

    expect(await sync.syncEvent(baseEvent)).toEqual({ synced: true })
    expect(core.upsertSubscription).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      entitlementId: 'airi_go',
      status: 'active',
    }))
    expect(core.openPeriod).toHaveBeenCalledWith(expect.objectContaining({
      grantedCredit: 2000,
      eventKey: 'event-1:airi_go',
    }))
    expect(core.retireOtherEntitlements).toHaveBeenCalledWith('user-1', 'airi_go')
  })

  it('syncs status without a period for informative events', async () => {
    const core = createCore()
    const sync = createRevenuecatSubscriptionSync(core, createConfigKV())

    expect(await sync.syncEvent({ ...baseEvent, id: 'event-2', type: 'CANCELLATION' }))
      .toEqual({ synced: true })
    expect(core.upsertSubscription).toHaveBeenCalled()
    expect(core.openPeriod).not.toHaveBeenCalled()
    expect(core.retireOtherEntitlements).not.toHaveBeenCalled()
  })

  it('opens a period and retires other entitlements on product change', async () => {
    const core = createCore()
    const sync = createRevenuecatSubscriptionSync(core, createConfigKV())

    expect(await sync.syncEvent({ ...baseEvent, id: 'event-3', type: 'PRODUCT_CHANGE' }))
      .toEqual({ synced: true })
    expect(core.openPeriod).toHaveBeenCalledWith(expect.objectContaining({
      grantedCredit: 2000,
      eventKey: 'event-3:airi_go',
    }))
    expect(core.retireOtherEntitlements).toHaveBeenCalledWith('user-1', 'airi_go')
  })

  it('syncs uncancellation without a new period', async () => {
    const core = createCore()
    const sync = createRevenuecatSubscriptionSync(core, createConfigKV())

    expect(await sync.syncEvent({ ...baseEvent, id: 'event-4', type: 'UNCANCELLATION' }))
      .toEqual({ synced: true })
    expect(core.upsertSubscription).toHaveBeenCalledWith(expect.objectContaining({
      status: 'active',
    }))
    expect(core.openPeriod).not.toHaveBeenCalled()
    expect(core.extendPeriod).not.toHaveBeenCalled()
    expect(core.retireOtherEntitlements).not.toHaveBeenCalled()
  })

  it('extends the open period without a new grant', async () => {
    const core = createCore()
    const sync = createRevenuecatSubscriptionSync(core, createConfigKV())
    const expirationAtMs = Date.now() + 14 * 24 * 60 * 60 * 1000

    expect(await sync.syncEvent({
      ...baseEvent,
      id: 'event-5',
      type: 'SUBSCRIPTION_EXTENDED',
      expirationAtMs,
    })).toEqual({ synced: true })
    expect(core.extendPeriod).toHaveBeenCalledWith({
      userId: 'user-1',
      entitlementId: 'airi_go',
      periodEnd: new Date(expirationAtMs),
    })
    expect(core.openPeriod).not.toHaveBeenCalled()
    expect(core.retireOtherEntitlements).not.toHaveBeenCalled()
  })

  it('skips an extension that has no expiration', async () => {
    const core = createCore()
    const sync = createRevenuecatSubscriptionSync(core, createConfigKV())

    expect(await sync.syncEvent({
      ...baseEvent,
      id: 'event-6',
      type: 'SUBSCRIPTION_EXTENDED',
      expirationAtMs: null,
    })).toEqual({ synced: true })
    expect(core.upsertSubscription).toHaveBeenCalled()
    expect(core.extendPeriod).not.toHaveBeenCalled()
    expect(core.openPeriod).not.toHaveBeenCalled()
  })

  it('acks unknown products without touching the core', async () => {
    const core = createCore()
    const sync = createRevenuecatSubscriptionSync(core, createConfigKV())

    expect(await sync.syncEvent({ ...baseEvent, productId: 'unknown' })).toEqual({ synced: false })
    expect(core.upsertSubscription).not.toHaveBeenCalled()
  })
})
