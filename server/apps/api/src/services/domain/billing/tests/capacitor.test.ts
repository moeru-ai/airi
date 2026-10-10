import type { Database } from '../../../../libs/db'

import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { mockDB } from '../../../../libs/mock-db'
import { createTestRedis } from '../../../../libs/tests/redis'
import { fluxTransaction, fluxUsage, userFlux } from '../../../../schemas'
import { createFluxTransactionService } from '../../flux-transaction'
import { createBillingService } from '../billing-service'
import { availableMicroFlux, capacitorPercent, nextCapacitorRecharge, refillCapacitor, settleOutstandingMicroFlux } from '../flux-posting'

import * as schema from '../../../../schemas'

const hour = 3_600_000
const periodStart = new Date('2026-10-01T00:00:00.000Z')
const nextPeriodStart = new Date('2026-11-01T00:00:00.000Z')

function activeCapacitor(quota: number, start = periodStart) {
  return { quota, periodStart: start, expiresAt: new Date(Date.now() + 24 * hour) }
}

describe('capacitor Flux bucket', () => {
  let db: Database
  let billing: ReturnType<typeof createBillingService>
  /** Reset config that a test sets. The billing service reads it on each settlement. */
  let config: { CAPACITOR_RESET_INTERVAL?: 'day' | 'week', CAPACITOR_RESET_AT?: string }

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

  describe('syncCapacitor', () => {
    it('grants the quota and records a capacitor ledger row', async () => {
      await billing.syncCapacitor('wallet', async () => activeCapacitor(100))

      expect(await wallet()).toMatchObject({ flux: 10, capacitorFlux: 100, capacitorQuota: 100, capacitorPeriodStart: periodStart })
      expect(await db.select().from(fluxTransaction)).toEqual([
        expect.objectContaining({ pool: 'capacitor', type: 'credit', amount: 100, balanceBefore: 0, balanceAfter: 100 }),
      ])
    })

    it('keeps spent capacitor Flux and only moves the expiry for the same period', async () => {
      await billing.syncCapacitor('wallet', async () => activeCapacitor(100))
      await spend('a', 30_000_000)
      const extended = { ...activeCapacitor(100), expiresAt: new Date(Date.now() + 48 * hour) }
      await billing.syncCapacitor('wallet', async () => extended)

      const row = await wallet()
      expect(row.capacitorFlux).toBe(70)
      expect(row.capacitorExpiresAt).toEqual(extended.expiresAt)
      expect(await db.select().from(fluxTransaction).where(eq(fluxTransaction.description, 'capacitor_refill'))).toHaveLength(1)
    })

    it('resets the bucket for another period and records the forfeited Flux', async () => {
      await billing.syncCapacitor('wallet', async () => activeCapacitor(100))
      await spend('a', 30_000_000)
      await billing.syncCapacitor('wallet', async () => activeCapacitor(100, nextPeriodStart))

      expect(await wallet()).toMatchObject({ capacitorFlux: 100, capacitorQuota: 100 })
      const grants = await db.select().from(fluxTransaction).where(eq(fluxTransaction.description, 'capacitor_refill'))
      expect(grants.map(grant => grant.balanceBefore).sort()).toEqual([0, 70])
    })

    it('expires the capacitor now when no capacitor is active', async () => {
      await billing.syncCapacitor('wallet', async () => activeCapacitor(100))
      await billing.syncCapacitor('wallet', async () => null)

      const row = await wallet()
      expect(row.capacitorExpiresAt!.getTime()).toBeLessThanOrEqual(Date.now())
      expect(availableMicroFlux(row)).toBe(10_000_000n)
    })

    // A refund of an upgrade makes RevenueCat report the older period again.
    it('keeps the spent amount when an earlier period returns', async () => {
      await billing.syncCapacitor('wallet', async () => activeCapacitor(100))
      await spend('a', 30_000_000)
      await billing.syncCapacitor('wallet', async () => activeCapacitor(500, nextPeriodStart))
      await billing.syncCapacitor('wallet', async () => activeCapacitor(100))

      expect(await wallet()).toMatchObject({ capacitorFlux: 100, capacitorQuota: 100 })
      expect(await db.select().from(fluxTransaction).where(eq(fluxTransaction.description, 'capacitor_refill'))).toHaveLength(2)
    })

    it('creates no wallet for a user without a capacitor', async () => {
      await billing.syncCapacitor('stranger', async () => null)
      expect(await db.select().from(userFlux).where(eq(userFlux.userId, 'stranger'))).toHaveLength(0)
    })

    it('pays outstanding fees from the new grant', async () => {
      await db.update(userFlux).set({ flux: 0, unsettledMicroFlux: 3_500_000 }).where(eq(userFlux.userId, 'wallet'))
      await billing.syncCapacitor('wallet', async () => activeCapacitor(100))

      expect(await wallet()).toMatchObject({ capacitorFlux: 97, unsettledMicroFlux: 500_000 })
    })
  })

  describe('settlement', () => {
    it('spends the capacitor bucket before purchased Flux and splits one fee across both', async () => {
      await billing.syncCapacitor('wallet', async () => activeCapacitor(3))
      await db.update(userFlux).set({ fallbackToFlux: true }).where(eq(userFlux.userId, 'wallet'))
      const result = await spend('a', 5_000_000)

      expect(result).toMatchObject({ charged: 5, requested: 5 })
      expect(await wallet()).toMatchObject({ capacitorFlux: 0, flux: 8 })
      const debits = await db.select().from(fluxTransaction).where(eq(fluxTransaction.type, 'debit'))
      expect(debits.map(row => [row.pool, row.amount, row.balanceBefore, row.balanceAfter]).sort()).toEqual([
        ['capacitor', 3, 3, 0],
        ['wallet', 2, 10, 8],
      ])
    })

    it('leaves purchased Flux alone when the fallback is off', async () => {
      await billing.syncCapacitor('wallet', async () => activeCapacitor(3))
      const result = await spend('a', 5_000_000)

      expect(result).toMatchObject({ charged: 3, requested: 5, unsettledMicroFlux: 2_000_000 })
      expect(await wallet()).toMatchObject({ capacitorFlux: 0, flux: 10 })
    })

    it('spends purchased Flux once the capacitor has expired', async () => {
      await billing.syncCapacitor('wallet', async () => activeCapacitor(100))
      await billing.syncCapacitor('wallet', async () => null)
      await spend('a', 4_000_000)

      expect(await wallet()).toMatchObject({ capacitorFlux: 100, flux: 6 })
    })

    it('does not charge a replayed source twice', async () => {
      await billing.syncCapacitor('wallet', async () => activeCapacitor(100))
      await spend('a', 4_000_000)
      const replay = await spend('a', 4_000_000)

      expect(replay).toMatchObject({ replay: true, charged: 0 })
      expect((await wallet()).capacitorFlux).toBe(96)
    })
  })

  describe('resets', () => {
    const lastMonth = new Date(Date.now() - 30 * 24 * hour)
    const filledLongAgo = () => db.update(userFlux).set({ capacitorFilledAt: lastMonth }).where(eq(userFlux.userId, 'wallet'))

    it('refills on the reset window when an interval is configured', async () => {
      await billing.syncCapacitor('wallet', async () => activeCapacitor(100, lastMonth))
      await spend('a', 30_000_000)
      await filledLongAgo()
      config.CAPACITOR_RESET_INTERVAL = 'day'

      expect((await billing.getWallet('wallet')).capacitorFlux).toBe(100)
      await spend('b', 10_000_000)
      expect((await wallet()).capacitorFlux).toBe(90)
      await spend('c', 10_000_000)
      expect((await wallet()).capacitorFlux).toBe(80)
    })

    it('refills every wallet once after the global reset time', async () => {
      await billing.syncCapacitor('wallet', async () => activeCapacitor(100))
      await spend('a', 30_000_000)
      config.CAPACITOR_RESET_AT = new Date(Date.now() + hour).toISOString()
      await spend('b', 10_000_000)
      expect((await wallet()).capacitorFlux).toBe(60)

      config.CAPACITOR_RESET_AT = new Date().toISOString()
      await spend('c', 10_000_000)
      await spend('d', 10_000_000)
      expect((await wallet()).capacitorFlux).toBe(80)
    })

    it('refills one wallet after its own reset time', async () => {
      await billing.syncCapacitor('wallet', async () => activeCapacitor(100))
      await spend('a', 30_000_000)
      await db.update(userFlux).set({ capacitorResetAt: new Date() }).where(eq(userFlux.userId, 'wallet'))
      await spend('b', 10_000_000)

      expect((await wallet()).capacitorFlux).toBe(90)
      const grants = await db.select().from(fluxTransaction).where(eq(fluxTransaction.description, 'capacitor_refill'))
      expect(grants.map(grant => grant.balanceBefore).sort()).toEqual([0, 70])
    })

    it('does not refill an expired capacitor', async () => {
      await billing.syncCapacitor('wallet', async () => activeCapacitor(100))
      await spend('a', 30_000_000)
      await billing.syncCapacitor('wallet', async () => null)
      await db.update(userFlux).set({ capacitorResetAt: new Date() }).where(eq(userFlux.userId, 'wallet'))
      await spend('b', 1_000_000)

      expect(await wallet()).toMatchObject({ capacitorFlux: 70, flux: 9 })
    })
  })

  it('keeps capacitor ledger rows out of the purchased Flux history', async () => {
    await billing.syncCapacitor('wallet', async () => activeCapacitor(100))
    await spend('a', 4_000_000)

    expect((await createFluxTransactionService(db).getHistory('wallet', 10, 0)).records).toEqual([])
  })

  it('stores the fallback choice and requires a wallet', async () => {
    await billing.setFallbackToFlux('wallet', true)
    expect((await wallet()).fallbackToFlux).toBe(true)
    await expect(billing.setFallbackToFlux('stranger', true)).rejects.toThrow('No active flux record')
  })

  it('keeps capacitor ledger rows out of the purchased Flux capacity', async () => {
    // The pack credit is older, so the capacitor grant is the latest credit row.
    await db.insert(fluxTransaction).values({ userId: 'wallet', type: 'credit', pool: 'wallet', amount: 10, balanceBefore: 0, balanceAfter: 10, description: 'pack', createdAt: new Date(Date.now() - hour) })
    await billing.syncCapacitor('wallet', async () => activeCapacitor(100))

    expect(await createFluxTransactionService(db).getStats('wallet')).toEqual({ capacity: 10 })
  })
})

describe('flux posting math', () => {
  const base = { flux: 10, unsettledMicroFlux: 0, capacitorFlux: 5, capacitorExpiresAt: new Date(Date.now() + hour), fallbackToFlux: false }

  it('counts an expired capacitor as 0', () => {
    expect(availableMicroFlux({ ...base, capacitorExpiresAt: new Date(Date.now() - hour) })).toBe(10_000_000n)
  })

  it('counts purchased Flux only with the fallback while a capacitor is active', () => {
    expect(availableMicroFlux(base)).toBe(5_000_000n)
    expect(availableMicroFlux({ ...base, fallbackToFlux: true })).toBe(15_000_000n)
  })

  it('settles whole Flux and keeps the fraction outstanding', () => {
    expect(settleOutstandingMicroFlux({ ...base, fallbackToFlux: true, unsettledMicroFlux: 7_250_000 })).toMatchObject({
      fromCapacitor: 5,
      fromPurchased: 2,
      capacitorFlux: 0,
      flux: 8,
      unsettledMicroFlux: 250_000,
    })
  })

  it('refills only when the last refill is before the latest reset that has passed', () => {
    const now = new Date('2026-10-10T12:00:00.000Z')
    const capacitor = {
      capacitorFlux: 0,
      capacitorQuota: 100,
      capacitorExpiresAt: new Date('2026-11-01T00:00:00.000Z'),
      capacitorPeriodStart: new Date('2026-10-01T06:00:00.000Z'),
      capacitorFilledAt: new Date('2026-10-01T06:00:00.000Z'),
      capacitorResetAt: null,
    }
    const none = { intervalMs: null, resetAt: null }

    const daily = { intervalMs: 24 * hour, resetAt: null }
    const filledToday = { ...capacitor, capacitorFilledAt: new Date('2026-10-10T07:00:00.000Z') }

    expect(refillCapacitor(capacitor, none, now).refilled).toBe(false)
    expect(refillCapacitor(capacitor, daily, now)).toMatchObject({ refilled: true, capacitorFlux: 100, capacitorFilledAt: now })
    // The daily window starts at 06:00, the time of day of the period start.
    expect(refillCapacitor(filledToday, daily, now).refilled).toBe(false)
    expect(refillCapacitor(capacitor, { intervalMs: null, resetAt: new Date('2026-10-05T00:00:00.000Z') }, now).refilled).toBe(true)
    expect(refillCapacitor(capacitor, { intervalMs: null, resetAt: new Date('2026-10-20T00:00:00.000Z') }, now).refilled).toBe(false)
    expect(refillCapacitor({ ...capacitor, capacitorExpiresAt: new Date('2026-10-02T00:00:00.000Z') }, daily, now).refilled).toBe(false)
  })

  it('gives the next recharge as the start of the next window inside the billing period', () => {
    const now = new Date('2026-10-10T12:00:00.000Z')
    const capacitor = {
      capacitorFlux: 0,
      capacitorQuota: 100,
      capacitorExpiresAt: new Date('2026-11-01T06:00:00.000Z'),
      capacitorPeriodStart: new Date('2026-10-01T06:00:00.000Z'),
      capacitorFilledAt: null,
      capacitorResetAt: null,
    }
    const daily = { intervalMs: 24 * hour, resetAt: null }

    expect(nextCapacitorRecharge(capacitor, daily, now)).toEqual(new Date('2026-10-11T06:00:00.000Z'))
    expect(nextCapacitorRecharge(capacitor, { intervalMs: null, resetAt: null }, now)).toBeNull()
    // The last window of the period ends at the expiry, so only a renewal recharges after it.
    expect(nextCapacitorRecharge(capacitor, daily, new Date('2026-10-31T12:00:00.000Z'))).toBeNull()
    expect(nextCapacitorRecharge({ ...capacitor, capacitorExpiresAt: new Date('2026-10-05T00:00:00.000Z') }, daily, now)).toBeNull()
  })

  it('refills once when the period start is ahead of this clock', () => {
    const now = new Date('2026-10-01T05:59:59.000Z')
    const capacitor = {
      capacitorFlux: 0,
      capacitorQuota: 100,
      capacitorExpiresAt: new Date('2026-11-01T00:00:00.000Z'),
      capacitorPeriodStart: new Date('2026-10-01T06:00:00.000Z'),
      capacitorFilledAt: null,
      capacitorResetAt: null,
    }
    const none = { intervalMs: null, resetAt: null }

    const first = refillCapacitor(capacitor, none, now)
    expect(first.refilled).toBe(true)
    expect(refillCapacitor({ ...first, capacitorFlux: 40 }, none, now).refilled).toBe(false)
  })

  it('reports the remaining capacitor percent only for an active capacitor', () => {
    const capacitor = { capacitorFlux: 25, capacitorQuota: 100, capacitorExpiresAt: new Date(Date.now() + hour) }
    expect(capacitorPercent(capacitor)).toBe(25)
    expect(capacitorPercent({ ...capacitor, capacitorExpiresAt: new Date(Date.now() - hour) })).toBeNull()
    expect(capacitorPercent({ ...capacitor, capacitorQuota: 0 })).toBeNull()
  })
})
