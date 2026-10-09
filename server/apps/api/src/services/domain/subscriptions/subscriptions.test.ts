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
    return createSubscriptionService(db)
  }

  it('keeps spent Credits when the same period syncs again', async () => {
    const service = await setup()
    const period = {
      entitlementId: 'airi_go',
      grantedCredit: 2000,
      periodStart: new Date('2026-10-01T00:00:00.000Z'),
      periodEnd: new Date(Date.now() + 60_000),
    }

    await service.syncPeriod('user-1', async () => period)
    await service.debitCredits({ userId: 'user-1', microCredit: 500 * MICRO_PER_CREDIT, requestId: 'req-1' })
    await service.syncPeriod('user-1', async () => period)

    const status = await service.getStatus('user-1')
    expect(status.allowances).toHaveLength(1)
    expect(status.allowances).toMatchObject([{ grantedCredit: 2000, usedCredit: 500 }])
  })

  it('moves the period end when RevenueCat extends the period', async () => {
    const service = await setup()
    const period = {
      entitlementId: 'airi_go',
      grantedCredit: 2000,
      periodStart: new Date('2026-10-01T00:00:00.000Z'),
      periodEnd: new Date(Date.now() + 60_000),
    }
    const extended = new Date(Date.now() + 120_000)

    await service.syncPeriod('user-1', async () => period)
    await service.syncPeriod('user-1', async () => ({ ...period, periodEnd: extended }))

    const status = await service.getStatus('user-1')
    expect(status.allowances).toMatchObject([{ periodEnd: extended.toISOString() }])
  })

  it('grants a new period and forfeits the old remainder', async () => {
    const service = await setup()
    const periodEnd = new Date(Date.now() + 60_000)

    await service.syncPeriod('user-1', async () => ({
      entitlementId: 'airi_go',
      grantedCredit: 2000,
      periodStart: new Date('2026-10-01T00:00:00.000Z'),
      periodEnd,
    }))
    await service.debitCredits({ userId: 'user-1', microCredit: 500 * MICRO_PER_CREDIT, requestId: 'req-1' })
    await service.syncPeriod('user-1', async () => ({
      entitlementId: 'airi_plus',
      grantedCredit: 5000,
      periodStart: new Date('2026-10-15T00:00:00.000Z'),
      periodEnd,
    }))

    const status = await service.getStatus('user-1')
    expect(status.allowances).toMatchObject([{ entitlementId: 'airi_plus', grantedCredit: 5000, usedCredit: 0 }])
  })

  it('closes every period when no plan is active', async () => {
    const service = await setup()
    await service.syncPeriod('user-1', async () => ({
      entitlementId: 'airi_go',
      grantedCredit: 2000,
      periodStart: new Date('2026-10-01T00:00:00.000Z'),
      periodEnd: null,
    }))
    await service.syncPeriod('user-1', async () => null)

    expect(await service.spendableMicro('user-1')).toBe(0)
  })

  it('opens a closed period again with its spent Credits', async () => {
    const service = await setup()
    const period = {
      entitlementId: 'airi_go',
      grantedCredit: 2000,
      periodStart: new Date('2026-10-01T00:00:00.000Z'),
      periodEnd: new Date(Date.now() + 60_000),
    }

    await service.syncPeriod('user-1', async () => period)
    await service.debitCredits({ userId: 'user-1', microCredit: 500 * MICRO_PER_CREDIT, requestId: 'req-1' })
    await service.syncPeriod('user-1', async () => null)
    await service.syncPeriod('user-1', async () => period)

    expect(await service.spendableMicro('user-1')).toBe(1500 * MICRO_PER_CREDIT)
  })

  it('does not change another user', async () => {
    const service = await setup()
    const period = {
      entitlementId: 'airi_go',
      grantedCredit: 2000,
      periodStart: new Date('2026-10-01T00:00:00.000Z'),
      periodEnd: null,
    }
    await service.syncPeriod('user-1', async () => period)
    await service.syncPeriod('user-2', async () => null)

    expect(await service.spendableMicro('user-1')).toBe(2000 * MICRO_PER_CREDIT)
  })

  it('spends micro-Credits idempotently and leaves a short period untouched', async () => {
    const service = await setup()
    await service.syncPeriod('user-1', async () => ({
      entitlementId: 'airi_go',
      grantedCredit: 2000,
      periodStart: new Date(),
      periodEnd: null,
    }))

    const fee = 1_500_000
    expect(await service.debitCredits({ userId: 'user-1', microCredit: fee, requestId: 'req-1' }))
      .toEqual({ chargedMicro: fee, requestedMicro: fee, replay: false })
    expect(await service.debitCredits({ userId: 'user-1', microCredit: fee, requestId: 'req-1' }))
      .toEqual({ chargedMicro: fee, requestedMicro: fee, replay: true })
    expect(await service.debitCredits({ userId: 'user-1', microCredit: 5000 * MICRO_PER_CREDIT, requestId: 'req-2' }))
      .toEqual({ chargedMicro: 0, requestedMicro: 5000 * MICRO_PER_CREDIT, replay: false })
    expect(await service.spendableMicro('user-1')).toBe(1998 * MICRO_PER_CREDIT + 500_000)

    const status = await service.getStatus('user-1')
    expect(status.allowances).toMatchObject([{
      grantedCredit: 2000,
      usedCredit: 1,
      unsettledMicroCredit: 500_000,
      remainingMicro: 1998 * MICRO_PER_CREDIT + 500_000,
    }])
  })

  it('spends the earliest open period when two are open', async () => {
    const service = await setup()
    const sooner = new Date(Date.now() + 86_400_000)
    const later = new Date(Date.now() + 172_800_000)
    await db.insert(schema.subscriptionAllowance).values([
      {
        userId: 'user-1',
        entitlementId: 'early',
        grantedCredit: 600,
        periodStart: new Date(),
        periodEnd: sooner,
      },
      {
        userId: 'user-1',
        entitlementId: 'later',
        grantedCredit: 5000,
        periodStart: new Date(),
        periodEnd: later,
      },
    ])
    expect(await service.spendableMicro('user-1')).toBe(600 * MICRO_PER_CREDIT)
  })

  it('does not spend a period that already ended', async () => {
    const service = await setup()
    await service.syncPeriod('user-1', async () => ({
      entitlementId: 'airi_go',
      grantedCredit: 2000,
      periodStart: new Date(Date.now() - 10_000),
      periodEnd: new Date(Date.now() - 1000),
    }))
    expect(await service.spendableMicro('user-1')).toBe(0)
    expect((await service.getStatus('user-1')).allowances).toEqual([])
  })
})
