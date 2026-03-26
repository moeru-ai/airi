import type Redis from 'ioredis'

import type { Database } from '../../libs/db'
import type { createConfigKVService } from '../config-kv'

import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { createBillingService } from '../billing-service'
import { createOutboxService } from '../outbox-service'

import * as schema from '../../schemas'

function createMockConfigKV(overrides: Record<string, number> = {}): ReturnType<typeof createConfigKVService> {
  const defaults: Record<string, number> = { INITIAL_USER_FLUX: 100, FLUX_PER_CENT: 1, FLUX_PER_REQUEST: 1, ...overrides }
  return {
    get: vi.fn(async (key: string) => defaults[key]),
    getOrThrow: vi.fn(async (key: string) => defaults[key]),
    getOptional: vi.fn(async (key: string) => defaults[key] ?? null),
    set: vi.fn(),
  } as any
}

function createMockRedis(): Redis {
  const store = new Map<string, string>()
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => { store.set(key, value); return 'OK' }),
  } as unknown as Redis
}

describe('billingService', () => {
  let db: Database
  let redis: Redis
  let outboxService: ReturnType<typeof createOutboxService>
  let billingService: ReturnType<typeof createBillingService>

  beforeAll(async () => {
    db = await mockDB(schema)
    outboxService = createOutboxService(db)

    await db.insert(schema.user).values({
      id: 'user-billing-1',
      name: 'Billing User',
      email: 'billing@example.com',
    })
  })

  beforeEach(async () => {
    redis = createMockRedis()
    billingService = createBillingService(db, redis, outboxService, createMockConfigKV())

    await db.delete(schema.outboxEvents)
    await db.delete(schema.fluxAuditLog)
    await db.delete(schema.fluxLedger)
    await db.delete(schema.userFlux).where(eq(schema.userFlux.userId, 'user-billing-1'))
    await db.delete(schema.stripeCheckoutSession).where(eq(schema.stripeCheckoutSession.stripeSessionId, 'sess-billing-1'))

    await db.insert(schema.stripeCheckoutSession).values({
      userId: 'user-billing-1',
      stripeSessionId: 'sess-billing-1',
      mode: 'payment',
      status: 'complete',
      paymentStatus: 'paid',
      amountTotal: 500,
      currency: 'usd',
      fluxCredited: false,
    })
  })

  describe('creditFluxFromStripeCheckout', () => {
    it('credits flux, records ledger + audit, and enqueues outbox events in one transaction', async () => {
      const result = await billingService.creditFluxFromStripeCheckout({
        stripeEventId: 'stripe-evt-1',
        userId: 'user-billing-1',
        stripeSessionId: 'sess-billing-1',
        amountTotal: 500,
        currency: 'usd',
        fluxAmount: 50,
      })

      expect(result).toEqual({ applied: true, balanceAfter: 50 })

      const [fluxRecord] = await db.select().from(schema.userFlux).where(eq(schema.userFlux.userId, 'user-billing-1'))
      expect(fluxRecord?.flux).toBe(50)

      // Verify ledger entry
      const ledgerRecords = await db.select().from(schema.fluxLedger).where(eq(schema.fluxLedger.userId, 'user-billing-1'))
      expect(ledgerRecords).toHaveLength(1)
      expect(ledgerRecords[0]?.type).toBe('credit')
      expect(ledgerRecords[0]?.amount).toBe(50)
      expect(ledgerRecords[0]?.balanceBefore).toBe(0)
      expect(ledgerRecords[0]?.balanceAfter).toBe(50)

      // Verify audit log
      const auditRecords = await db.select().from(schema.fluxAuditLog).where(eq(schema.fluxAuditLog.userId, 'user-billing-1'))
      expect(auditRecords).toHaveLength(1)
      expect(auditRecords[0]?.amount).toBe(50)

      // Verify outbox events
      const outboxRecords = await db.select().from(schema.outboxEvents).orderBy(schema.outboxEvents.createdAt)
      expect(outboxRecords).toHaveLength(2)
      expect(outboxRecords.map(record => record.eventType)).toEqual(['flux.credited', 'stripe.checkout.completed'])

      // Verify stripe session marked as credited
      const [sessionRecord] = await db.select().from(schema.stripeCheckoutSession).where(eq(schema.stripeCheckoutSession.stripeSessionId, 'sess-billing-1'))
      expect(sessionRecord?.fluxCredited).toBe(true)

      // Verify Redis cache updated
      expect(redis.set).toHaveBeenCalledWith('flux:user-billing-1', '50')
    })

    it('is idempotent when the checkout session was already credited', async () => {
      await billingService.creditFluxFromStripeCheckout({
        stripeEventId: 'stripe-evt-1',
        userId: 'user-billing-1',
        stripeSessionId: 'sess-billing-1',
        amountTotal: 500,
        currency: 'usd',
        fluxAmount: 50,
      })

      const second = await billingService.creditFluxFromStripeCheckout({
        stripeEventId: 'stripe-evt-1',
        userId: 'user-billing-1',
        stripeSessionId: 'sess-billing-1',
        amountTotal: 500,
        currency: 'usd',
        fluxAmount: 50,
      })

      expect(second).toEqual({ applied: false })

      const outboxRecords = await db.select().from(schema.outboxEvents)
      expect(outboxRecords).toHaveLength(2)
    })
  })

  describe('debitFlux', () => {
    it('deducts balance, writes ledger + audit + outbox, updates Redis', async () => {
      // Setup: give user some flux first
      await db.insert(schema.userFlux).values({ userId: 'user-billing-1', flux: 100 })

      const result = await billingService.debitFlux({
        userId: 'user-billing-1',
        amount: 30,
        requestId: 'req-1',
        description: 'gpt-4',
      })

      expect(result).toEqual({ userId: 'user-billing-1', flux: 70 })

      // Verify DB balance
      const [fluxRecord] = await db.select().from(schema.userFlux).where(eq(schema.userFlux.userId, 'user-billing-1'))
      expect(fluxRecord?.flux).toBe(70)

      // Verify ledger
      const ledgerRecords = await db.select().from(schema.fluxLedger).where(eq(schema.fluxLedger.userId, 'user-billing-1'))
      expect(ledgerRecords).toHaveLength(1)
      expect(ledgerRecords[0]).toMatchObject({
        type: 'debit',
        amount: 30,
        balanceBefore: 100,
        balanceAfter: 70,
        requestId: 'req-1',
      })

      // Verify audit log
      const auditRecords = await db.select().from(schema.fluxAuditLog).where(eq(schema.fluxAuditLog.userId, 'user-billing-1'))
      expect(auditRecords).toHaveLength(1)
      expect(auditRecords[0]?.amount).toBe(-30)

      // Verify outbox event
      const outboxRecords = await db.select().from(schema.outboxEvents)
      expect(outboxRecords).toHaveLength(1)
      expect(outboxRecords[0]?.eventType).toBe('flux.debited')

      // Verify Redis cache updated
      expect(redis.set).toHaveBeenCalledWith('flux:user-billing-1', '70')
    })

    it('throws 402 when balance is insufficient', async () => {
      await db.insert(schema.userFlux).values({ userId: 'user-billing-1', flux: 5 })

      await expect(billingService.debitFlux({
        userId: 'user-billing-1',
        amount: 10,
      })).rejects.toThrow('Insufficient flux')

      // Verify no side effects
      const [fluxRecord] = await db.select().from(schema.userFlux).where(eq(schema.userFlux.userId, 'user-billing-1'))
      expect(fluxRecord?.flux).toBe(5)

      const ledgerRecords = await db.select().from(schema.fluxLedger)
      expect(ledgerRecords).toHaveLength(0)

      const outboxRecords = await db.select().from(schema.outboxEvents)
      expect(outboxRecords).toHaveLength(0)
    })
  })

  describe('creditFlux', () => {
    it('credits balance with ledger + audit + outbox', async () => {
      const result = await billingService.creditFlux({
        userId: 'user-billing-1',
        amount: 50,
        description: 'Admin grant',
        source: 'admin',
      })

      expect(result.balanceAfter).toBe(50)
      expect(result.balanceBefore).toBe(0)

      // Verify ledger
      const ledgerRecords = await db.select().from(schema.fluxLedger).where(eq(schema.fluxLedger.userId, 'user-billing-1'))
      expect(ledgerRecords).toHaveLength(1)
      expect(ledgerRecords[0]).toMatchObject({
        type: 'credit',
        amount: 50,
        balanceBefore: 0,
        balanceAfter: 50,
      })

      // Verify outbox
      const outboxRecords = await db.select().from(schema.outboxEvents)
      expect(outboxRecords).toHaveLength(1)
      expect(outboxRecords[0]?.eventType).toBe('flux.credited')
    })
  })
})
