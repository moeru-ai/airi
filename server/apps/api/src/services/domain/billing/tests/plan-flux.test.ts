import type { Database } from '../../../../libs/db'

import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { mockDB } from '../../../../libs/mock-db'
import { createTestRedis } from '../../../../libs/tests/redis'
import { fluxTransaction, fluxUsage, userFlux } from '../../../../schemas'
import { createFluxTransactionService } from '../../flux-transaction'
import { createBillingService } from '../billing-service'
import { availableMicroFlux, planRemainingPercent, refillPlan, settleOutstandingMicroFlux } from '../flux-posting'

import * as schema from '../../../../schemas'

const hour = 3_600_000
const periodStart = new Date('2026-10-01T00:00:00.000Z')
const nextPeriodStart = new Date('2026-11-01T00:00:00.000Z')

function activePlan(quota: number, start = periodStart) {
  return { quota, periodStart: start, expiresAt: new Date(Date.now() + 24 * hour) }
}

describe('plan Flux bucket', () => {
  let db: Database
  let billing: ReturnType<typeof createBillingService>
  /** Reset config that a test sets. The billing service reads it on each settlement. */
  let config: { PLAN_FLUX_RESET_INTERVAL?: 'day' | 'week', PLAN_FLUX_RESET_AT?: string }

  const wallet = async () => (await db.select().from(userFlux).where(eq(userFlux.userId, 'wallet')))[0]!
  const spend = (id: string, amountMicroFlux: number) =>
    billing.postFluxUsage({ userId: 'wallet', source: { type: 'test', id }, amountMicroFlux })

  beforeAll(async () => {
    db = await mockDB(schema)
  })
  beforeEach(async () => {
    await db.delete(fluxTransaction)
    await db.delete(fluxUsage)
    await db.delete(userFlux)
    await db.insert(userFlux).values({ userId: 'wallet', flux: 10 })
    config = {}
    billing = createBillingService(db, createTestRedis(), {
      getOptional: async key => (config as Record<string, unknown>)[key] as never ?? null,
    })
  })

  describe('syncPlan', () => {
    it('grants the quota and records a plan ledger row', async () => {
      await billing.syncPlan('wallet', async () => activePlan(100))

      expect(await wallet()).toMatchObject({ flux: 10, planFlux: 100, planQuota: 100, planPeriodStart: periodStart })
      expect(await db.select().from(fluxTransaction)).toEqual([
        expect.objectContaining({ pool: 'plan', type: 'credit', amount: 100, balanceBefore: 0, balanceAfter: 100 }),
      ])
    })

    it('keeps spent plan Flux and only moves the expiry for the same period', async () => {
      await billing.syncPlan('wallet', async () => activePlan(100))
      await spend('a', 30_000_000)
      const extended = { ...activePlan(100), expiresAt: new Date(Date.now() + 48 * hour) }
      await billing.syncPlan('wallet', async () => extended)

      const row = await wallet()
      expect(row.planFlux).toBe(70)
      expect(row.planExpiresAt).toEqual(extended.expiresAt)
      expect(await db.select().from(fluxTransaction).where(eq(fluxTransaction.description, 'plan_grant'))).toHaveLength(1)
    })

    it('resets the bucket for another period and records the forfeited Flux', async () => {
      await billing.syncPlan('wallet', async () => activePlan(100))
      await spend('a', 30_000_000)
      await billing.syncPlan('wallet', async () => activePlan(100, nextPeriodStart))

      expect(await wallet()).toMatchObject({ planFlux: 100, planQuota: 100 })
      const grants = await db.select().from(fluxTransaction).where(eq(fluxTransaction.description, 'plan_grant'))
      expect(grants.map(grant => grant.balanceBefore).sort()).toEqual([0, 70])
    })

    it('expires the plan now when no plan is active', async () => {
      await billing.syncPlan('wallet', async () => activePlan(100))
      await billing.syncPlan('wallet', async () => null)

      const row = await wallet()
      expect(row.planExpiresAt!.getTime()).toBeLessThanOrEqual(Date.now())
      expect(availableMicroFlux(row)).toBe(10_000_000n)
    })

    // A refund of an upgrade makes RevenueCat report the older period again.
    it('keeps the spent amount when an earlier period returns', async () => {
      await billing.syncPlan('wallet', async () => activePlan(100))
      await spend('a', 30_000_000)
      await billing.syncPlan('wallet', async () => activePlan(500, nextPeriodStart))
      await billing.syncPlan('wallet', async () => activePlan(100))

      expect(await wallet()).toMatchObject({ planFlux: 100, planQuota: 100 })
      expect(await db.select().from(fluxTransaction).where(eq(fluxTransaction.description, 'plan_grant'))).toHaveLength(2)
    })

    it('creates no wallet for a user without a plan', async () => {
      await billing.syncPlan('stranger', async () => null)
      expect(await db.select().from(userFlux).where(eq(userFlux.userId, 'stranger'))).toHaveLength(0)
    })

    it('pays outstanding fees from the new grant', async () => {
      await db.update(userFlux).set({ flux: 0, unsettledMicroFlux: 3_500_000 }).where(eq(userFlux.userId, 'wallet'))
      await billing.syncPlan('wallet', async () => activePlan(100))

      expect(await wallet()).toMatchObject({ planFlux: 97, unsettledMicroFlux: 500_000 })
    })
  })

  describe('settlement', () => {
    it('spends the plan bucket before purchased Flux and splits one fee across both', async () => {
      await billing.syncPlan('wallet', async () => activePlan(3))
      await db.update(userFlux).set({ fallbackToFlux: true }).where(eq(userFlux.userId, 'wallet'))
      const result = await spend('a', 5_000_000)

      expect(result).toMatchObject({ charged: 5, requested: 5 })
      expect(await wallet()).toMatchObject({ planFlux: 0, flux: 8 })
      const debits = await db.select().from(fluxTransaction).where(eq(fluxTransaction.type, 'debit'))
      expect(debits.map(row => [row.pool, row.amount, row.balanceBefore, row.balanceAfter]).sort()).toEqual([
        ['plan', 3, 3, 0],
        ['wallet', 2, 10, 8],
      ])
    })

    it('leaves purchased Flux alone when the fallback is off', async () => {
      await billing.syncPlan('wallet', async () => activePlan(3))
      const result = await spend('a', 5_000_000)

      expect(result).toMatchObject({ charged: 3, requested: 5, unsettledMicroFlux: 2_000_000 })
      expect(await wallet()).toMatchObject({ planFlux: 0, flux: 10 })
    })

    it('spends purchased Flux once the plan has expired', async () => {
      await billing.syncPlan('wallet', async () => activePlan(100))
      await billing.syncPlan('wallet', async () => null)
      await spend('a', 4_000_000)

      expect(await wallet()).toMatchObject({ planFlux: 100, flux: 6 })
    })

    it('does not charge a replayed source twice', async () => {
      await billing.syncPlan('wallet', async () => activePlan(100))
      await spend('a', 4_000_000)
      const replay = await spend('a', 4_000_000)

      expect(replay).toMatchObject({ replay: true, charged: 0 })
      expect((await wallet()).planFlux).toBe(96)
    })
  })

  describe('resets', () => {
    const lastMonth = new Date(Date.now() - 30 * 24 * hour)
    const filledLongAgo = () => db.update(userFlux).set({ planFilledAt: lastMonth }).where(eq(userFlux.userId, 'wallet'))

    it('refills on the reset window when an interval is configured', async () => {
      await billing.syncPlan('wallet', async () => activePlan(100, lastMonth))
      await spend('a', 30_000_000)
      await filledLongAgo()
      config.PLAN_FLUX_RESET_INTERVAL = 'day'

      expect((await billing.getWallet('wallet')).planFlux).toBe(100)
      await spend('b', 10_000_000)
      expect((await wallet()).planFlux).toBe(90)
      await spend('c', 10_000_000)
      expect((await wallet()).planFlux).toBe(80)
    })

    it('refills every wallet once after the global reset time', async () => {
      await billing.syncPlan('wallet', async () => activePlan(100))
      await spend('a', 30_000_000)
      config.PLAN_FLUX_RESET_AT = new Date(Date.now() + hour).toISOString()
      await spend('b', 10_000_000)
      expect((await wallet()).planFlux).toBe(60)

      config.PLAN_FLUX_RESET_AT = new Date().toISOString()
      await spend('c', 10_000_000)
      await spend('d', 10_000_000)
      expect((await wallet()).planFlux).toBe(80)
    })

    it('refills one wallet after its own reset time', async () => {
      await billing.syncPlan('wallet', async () => activePlan(100))
      await spend('a', 30_000_000)
      await db.update(userFlux).set({ planResetAt: new Date() }).where(eq(userFlux.userId, 'wallet'))
      await spend('b', 10_000_000)

      expect((await wallet()).planFlux).toBe(90)
      const grants = await db.select().from(fluxTransaction).where(eq(fluxTransaction.description, 'plan_grant'))
      expect(grants.map(grant => grant.balanceBefore).sort()).toEqual([0, 70])
    })

    it('does not refill an expired plan', async () => {
      await billing.syncPlan('wallet', async () => activePlan(100))
      await spend('a', 30_000_000)
      await billing.syncPlan('wallet', async () => null)
      await db.update(userFlux).set({ planResetAt: new Date() }).where(eq(userFlux.userId, 'wallet'))
      await spend('b', 1_000_000)

      expect(await wallet()).toMatchObject({ planFlux: 70, flux: 9 })
    })
  })

  it('keeps plan ledger rows out of the purchased Flux history', async () => {
    await billing.syncPlan('wallet', async () => activePlan(100))
    await spend('a', 4_000_000)

    expect((await createFluxTransactionService(db).getHistory('wallet', 10, 0)).records).toEqual([])
  })

  it('stores the fallback choice and requires a wallet', async () => {
    await billing.setFallbackToFlux('wallet', true)
    expect((await wallet()).fallbackToFlux).toBe(true)
    await expect(billing.setFallbackToFlux('stranger', true)).rejects.toThrow('No active flux record')
  })

  it('keeps plan ledger rows out of the purchased Flux capacity', async () => {
    // The pack credit is older, so the plan grant is the latest credit row.
    await db.insert(fluxTransaction).values({ userId: 'wallet', type: 'credit', pool: 'wallet', amount: 10, balanceBefore: 0, balanceAfter: 10, description: 'pack', createdAt: new Date(Date.now() - hour) })
    await billing.syncPlan('wallet', async () => activePlan(100))

    expect(await createFluxTransactionService(db).getStats('wallet')).toEqual({ capacity: 10 })
  })
})

describe('flux posting math', () => {
  const base = { flux: 10, unsettledMicroFlux: 0, planFlux: 5, planExpiresAt: new Date(Date.now() + hour), fallbackToFlux: false }

  it('counts an expired plan as 0', () => {
    expect(availableMicroFlux({ ...base, planExpiresAt: new Date(Date.now() - hour) })).toBe(10_000_000n)
  })

  it('counts purchased Flux only with the fallback while a plan is active', () => {
    expect(availableMicroFlux(base)).toBe(5_000_000n)
    expect(availableMicroFlux({ ...base, fallbackToFlux: true })).toBe(15_000_000n)
  })

  it('settles whole Flux and keeps the fraction outstanding', () => {
    expect(settleOutstandingMicroFlux({ ...base, fallbackToFlux: true, unsettledMicroFlux: 7_250_000 })).toMatchObject({
      fromPlan: 5,
      fromPurchased: 2,
      planFlux: 0,
      flux: 8,
      unsettledMicroFlux: 250_000,
    })
  })

  it('refills only when the last refill is before the latest reset that has passed', () => {
    const now = new Date('2026-10-10T12:00:00.000Z')
    const plan = {
      planFlux: 0,
      planQuota: 100,
      planExpiresAt: new Date('2026-11-01T00:00:00.000Z'),
      planPeriodStart: new Date('2026-10-01T06:00:00.000Z'),
      planFilledAt: new Date('2026-10-01T06:00:00.000Z'),
      planResetAt: null,
    }
    const none = { intervalMs: null, resetAt: null }

    const daily = { intervalMs: 24 * hour, resetAt: null }
    const filledToday = { ...plan, planFilledAt: new Date('2026-10-10T07:00:00.000Z') }

    expect(refillPlan(plan, none, now).refilled).toBe(false)
    expect(refillPlan(plan, daily, now)).toMatchObject({ refilled: true, planFlux: 100, planFilledAt: now })
    // The daily window starts at 06:00, the time of day of the period start.
    expect(refillPlan(filledToday, daily, now).refilled).toBe(false)
    expect(refillPlan(plan, { intervalMs: null, resetAt: new Date('2026-10-05T00:00:00.000Z') }, now).refilled).toBe(true)
    expect(refillPlan(plan, { intervalMs: null, resetAt: new Date('2026-10-20T00:00:00.000Z') }, now).refilled).toBe(false)
    expect(refillPlan({ ...plan, planExpiresAt: new Date('2026-10-02T00:00:00.000Z') }, daily, now).refilled).toBe(false)
  })

  it('refills once when the period start is ahead of this clock', () => {
    const now = new Date('2026-10-01T05:59:59.000Z')
    const plan = {
      planFlux: 0,
      planQuota: 100,
      planExpiresAt: new Date('2026-11-01T00:00:00.000Z'),
      planPeriodStart: new Date('2026-10-01T06:00:00.000Z'),
      planFilledAt: null,
      planResetAt: null,
    }
    const none = { intervalMs: null, resetAt: null }

    const first = refillPlan(plan, none, now)
    expect(first.refilled).toBe(true)
    expect(refillPlan({ ...first, planFlux: 40 }, none, now).refilled).toBe(false)
  })

  it('reports the remaining plan percent only for an active plan', () => {
    const plan = { planFlux: 25, planQuota: 100, planExpiresAt: new Date(Date.now() + hour) }
    expect(planRemainingPercent(plan)).toBe(25)
    expect(planRemainingPercent({ ...plan, planExpiresAt: new Date(Date.now() - hour) })).toBeNull()
    expect(planRemainingPercent({ ...plan, planQuota: 0 })).toBeNull()
  })
})
