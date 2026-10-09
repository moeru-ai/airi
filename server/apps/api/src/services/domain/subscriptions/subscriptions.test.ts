import type { Database } from '../../../libs/db'

import { eq } from 'drizzle-orm'
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
    await db.delete(schema.revenuecatEvent)
    return createSubscriptionService(db)
  }

  it('opens periods idempotently and forfeits the old remainder', async () => {
    const service = await setup()
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

  it('forfeits every open period when a new period opens', async () => {
    const service = await setup()
    const start = new Date(Date.now() - 10_000)
    await service.openPeriod({
      userId: 'user-1',
      entitlementId: 'airi_go',
      grantedCredit: 2000,
      periodStart: start,
      periodEnd: null,
      eventKey: 'go',
    })
    await service.openPeriod({
      userId: 'user-1',
      entitlementId: 'airi_plus',
      grantedCredit: 5000,
      periodStart: new Date(start.getTime() + 1000),
      periodEnd: null,
      eventKey: 'plus',
    })

    const status = await service.getStatus('user-1')
    expect(status.allowances).toMatchObject([{ entitlementId: 'airi_plus', grantedCredit: 5000, usedCredit: 0 }])
  })

  it('stores a late older grant as closed', async () => {
    const service = await setup()
    const olderStart = new Date('2026-10-01T00:00:00.000Z')
    const newerStart = new Date('2026-10-15T00:00:00.000Z')
    await service.openPeriod({
      userId: 'user-1',
      entitlementId: 'airi_plus',
      grantedCredit: 5000,
      periodStart: newerStart,
      periodEnd: new Date('2026-11-15T00:00:00.000Z'),
      eventKey: 'newer',
    })
    expect(await service.openPeriod({
      userId: 'user-1',
      entitlementId: 'airi_go',
      grantedCredit: 2000,
      periodStart: olderStart,
      periodEnd: new Date('2026-11-01T00:00:00.000Z'),
      eventKey: 'older',
    })).toBe(true)

    const status = await service.getStatus('user-1', new Date('2026-10-20T00:00:00.000Z'))
    expect(status.allowances).toMatchObject([{ entitlementId: 'airi_plus', grantedCredit: 5000 }])

    const [older] = await db
      .select()
      .from(schema.subscriptionAllowance)
      .where(eq(schema.subscriptionAllowance.eventId, 'older'))
    expect(older?.periodEnd).toEqual(olderStart)
  })

  it('spends micro-Credits idempotently and leaves a short period untouched', async () => {
    const service = await setup()
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
    await service.openPeriod({
      userId: 'user-1',
      entitlementId: 'airi_go',
      grantedCredit: 2000,
      periodStart: new Date(Date.now() - 10_000),
      periodEnd: new Date(Date.now() - 1000),
      eventKey: 'closed',
    })
    expect(await service.spendableMicro('user-1')).toBe(0)
    expect((await service.getStatus('user-1')).allowances).toEqual([])
  })

  it('records a webhook event once and deletes it with the user', async () => {
    const service = await setup()
    const event = {
      eventId: 'event-1',
      type: 'TEST',
      appUserId: 'user-1',
      productId: null,
      entitlementIds: [],
      payload: { id: 'event-1' },
    }

    expect(await service.hasEvent('event-1')).toBe(false)
    await service.recordEvent(event)
    await service.recordEvent(event)
    expect(await service.hasEvent('event-1')).toBe(true)
    expect(await db.select().from(schema.revenuecatEvent)).toHaveLength(1)

    await service.deleteAllForUser('user-1')
    expect(await service.hasEvent('event-1')).toBe(false)
  })
})
