import type { Database } from '../../../libs/db'

import { beforeAll, describe, expect, it } from 'vitest'

import { mockDB } from '../../../libs/mock-db'
import { MICRO_PER_CREDIT } from '../billing/credit-posting'
import { createSubscriptionService } from './index'

import * as schema from '../../../schemas'

describe('subscription service', () => {
  let db: Database

  beforeAll(async () => {
    db = await mockDB(schema)
  })

  async function setup() {
    await db.delete(schema.subscriptionConsumption)
    await db.delete(schema.subscriptionAllowance)
    await db.delete(schema.subscription)
    return createSubscriptionService(db)
  }

  it('upserts subscription rows without a unique-violation retry storm', async () => {
    const service = await setup()
    const input = {
      userId: 'user-1',
      entitlementId: 'airi_go',
      status: 'active' as const,
      productId: 'rc_go_monthly',
      source: 'TEST_STORE',
      expiresAt: new Date(Date.now() + 1000),
    }

    await service.upsertSubscription(input)
    await service.upsertSubscription({ ...input, status: 'cancelled' })

    const status = await service.getStatus('user-1')
    expect(status.subscriptions).toMatchObject([{ entitlementId: 'airi_go', status: 'cancelled' }])
  })

  it('opens periods idempotently and forfeits the old remainder', async () => {
    const service = await setup()
    await service.upsertSubscription({
      userId: 'user-1',
      entitlementId: 'airi_go',
      status: 'active',
      expiresAt: new Date(Date.now() + 1000),
    })
    const period = {
      userId: 'user-1',
      entitlementId: 'airi_go',
      grantedCredit: 2000,
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 1000) as Date | null,
      eventKey: 'event-1:airi_go',
    }

    expect(await service.openPeriod(period)).toBe(true)
    expect(await service.openPeriod(period)).toBe(false)

    await service.debitCredits({ userId: 'user-1', microCredit: 500 * MICRO_PER_CREDIT, requestId: 'req-1' })
    expect(await service.openPeriod({ ...period, eventKey: 'event-2:airi_go' })).toBe(true)

    const status = await service.getStatus('user-1')
    expect(status.allowances).toHaveLength(1)
    expect(status.allowances).toMatchObject([{ grantedCredit: 2000, usedCredit: 0 }])
  })

  it('spends micro-Credits idempotently and leaves a short period untouched', async () => {
    const service = await setup()
    await service.upsertSubscription({
      userId: 'user-1',
      entitlementId: 'airi_go',
      status: 'active',
      expiresAt: new Date(Date.now() + 10_000),
    })
    await service.openPeriod({
      userId: 'user-1',
      entitlementId: 'airi_go',
      grantedCredit: 2000,
      periodStart: new Date(),
      periodEnd: null,
      eventKey: 'event-1',
    })

    const fee = 1_500_000
    expect(await service.debitCredits({ userId: 'user-1', microCredit: fee, requestId: 'req-1' }))
      .toEqual({ chargedMicro: fee, requestedMicro: fee })
    expect(await service.debitCredits({ userId: 'user-1', microCredit: fee, requestId: 'req-1' }))
      .toEqual({ chargedMicro: fee, requestedMicro: fee })
    expect(await service.debitCredits({ userId: 'user-1', microCredit: 5000 * MICRO_PER_CREDIT, requestId: 'req-2' }))
      .toEqual({ chargedMicro: 0, requestedMicro: 5000 * MICRO_PER_CREDIT })

    const status = await service.getStatus('user-1')
    expect(status.allowances).toMatchObject([{
      grantedCredit: 2000,
      usedCredit: 1,
      unsettledMicroCredit: 500_000,
      remainingMicro: 1998 * MICRO_PER_CREDIT + 500_000,
    }])
  })

  it('expires other entitlements when a plan replaces them', async () => {
    const service = await setup()
    await service.upsertSubscription({
      userId: 'user-1',
      entitlementId: 'airi_go',
      status: 'active',
      expiresAt: new Date(Date.now() + 10_000),
    })
    await service.openPeriod({
      userId: 'user-1',
      entitlementId: 'airi_go',
      grantedCredit: 2000,
      periodStart: new Date(),
      periodEnd: null,
      eventKey: 'go',
    })
    await service.upsertSubscription({
      userId: 'user-1',
      entitlementId: 'airi_plus',
      status: 'active',
      expiresAt: new Date(Date.now() + 10_000),
    })
    await service.retireOtherEntitlements('user-1', 'airi_plus')

    const status = await service.getStatus('user-1')
    expect(status.subscriptions).toMatchObject([{ entitlementId: 'airi_plus' }])
    expect(status.allowances).toEqual([])
  })

  it('revives missed rows and retires lapsed ones on reconcile', async () => {
    const service = await setup()
    await service.upsertSubscription({
      userId: 'user-1',
      entitlementId: 'airi_go',
      status: 'cancelled',
      expiresAt: new Date(Date.now() - 1000),
    })

    await service.reconcile('user-1', [
      { entitlementId: 'airi_go', active: true, expiresAt: new Date(Date.now() + 1000), quotaCredit: 2000 },
    ])
    let status = await service.getStatus('user-1')
    expect(status.subscriptions).toMatchObject([{ entitlementId: 'airi_go', status: 'active' }])
    expect(status.allowances).toMatchObject([{ grantedCredit: 2000 }])

    await service.reconcile('user-1', [], new Date(Date.now() + 2000))
    status = await service.getStatus('user-1', new Date(Date.now() + 2000))
    expect(status.subscriptions).toEqual([])

    const [row] = await db.select().from(schema.subscription)
    expect(row.status).toBe('expired')
  })

  it('never revokes unexpired access on a remote miss', async () => {
    const service = await setup()
    await service.upsertSubscription({
      userId: 'user-1',
      entitlementId: 'airi_go',
      status: 'active',
      expiresAt: new Date(Date.now() + 1000),
    })

    await service.reconcile('user-1', [])
    const status = await service.getStatus('user-1')
    expect(status.subscriptions).toMatchObject([{ entitlementId: 'airi_go', status: 'active' }])
  })
})
