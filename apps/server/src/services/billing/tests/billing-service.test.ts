import type Redis from 'ioredis'

import type { Database } from '../../../libs/db'
import type { createConfigKVService } from '../../config-kv'

import { and, eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { mockDB } from '../../../libs/mock-db'
import { userFluxRedisKey } from '../../../utils/redis-keys'
import { createBillingService } from '../billing-service'

import * as schema from '../../../schemas'

function createMockConfigKV(overrides: Record<string, number> = {}): ReturnType<typeof createConfigKVService> {
  const defaults: Record<string, number> = { INITIAL_USER_FLUX: 100, FLUX_PER_REQUEST: 1, ...overrides }
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
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value)
      return 'OK'
    }),
  } as unknown as Redis
}

describe('billingService', () => {
  let db: Database
  let redis: Redis
  let billingService: ReturnType<typeof createBillingService>

  beforeAll(async () => {
    db = await mockDB(schema)

    await db.insert(schema.user).values({
      id: 'user-billing-1',
      name: 'Billing User',
      email: 'billing@example.com',
    })
  })

  beforeEach(async () => {
    redis = createMockRedis()
    billingService = createBillingService(db, redis, createMockConfigKV())

    await db.delete(schema.fluxTransaction)
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
    it('credits flux, records transaction, and enqueues outbox events in one transaction', async () => {
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

      // Verify transaction entry
      const txRecords = await db.select().from(schema.fluxTransaction).where(eq(schema.fluxTransaction.userId, 'user-billing-1'))
      expect(txRecords).toHaveLength(1)
      expect(txRecords[0]?.type).toBe('credit')
      expect(txRecords[0]?.amount).toBe(50)
      expect(txRecords[0]?.balanceBefore).toBe(0)
      expect(txRecords[0]?.balanceAfter).toBe(50)

      // Verify metadata on transaction entry
      expect(txRecords[0]?.metadata).toMatchObject({
        stripeEventId: 'stripe-evt-1',
        stripeSessionId: 'sess-billing-1',
        source: 'stripe.checkout.completed',
      })

      // Verify stripe session marked as credited
      const [sessionRecord] = await db.select().from(schema.stripeCheckoutSession).where(eq(schema.stripeCheckoutSession.stripeSessionId, 'sess-billing-1'))
      expect(sessionRecord?.fluxCredited).toBe(true)

      // Verify Redis cache updated
      expect(redis.set).toHaveBeenCalledWith(userFluxRedisKey('user-billing-1'), '50')
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

      // Idempotent replay must not double-write the ledger
      const txRecords = await db.select().from(schema.fluxTransaction).where(eq(schema.fluxTransaction.userId, 'user-billing-1'))
      expect(txRecords).toHaveLength(1)
    })
  })

  describe('consumeFluxForLLM', () => {
    it('deducts balance, writes the ledger row inside the transaction, and refreshes Redis', async () => {
      // Setup: give user some flux first
      await db.insert(schema.userFlux).values({ userId: 'user-billing-1', flux: 100 })

      const result = await billingService.consumeFluxForLLM({
        userId: 'user-billing-1',
        amount: 30,
        requestId: 'req-1',
        description: 'gpt-4',
        promptTokens: 120,
        completionTokens: 80,
      })

      expect(result).toEqual({ userId: 'user-billing-1', flux: 70 })

      // Verify DB balance
      const [fluxRecord] = await db.select().from(schema.userFlux).where(eq(schema.userFlux.userId, 'user-billing-1'))
      expect(fluxRecord?.flux).toBe(70)

      // Ledger row written inline (no async consumer involved post-refactor)
      const [txRecord] = await db.select().from(schema.fluxTransaction).where(and(
        eq(schema.fluxTransaction.userId, 'user-billing-1'),
        eq(schema.fluxTransaction.requestId, 'req-1'),
      ))
      expect(txRecord).toMatchObject({
        userId: 'user-billing-1',
        type: 'debit',
        amount: 30,
        balanceBefore: 100,
        balanceAfter: 70,
        requestId: 'req-1',
        description: 'gpt-4',
      })
      expect(txRecord?.metadata).toMatchObject({
        promptTokens: 120,
        completionTokens: 80,
        source: 'llm.request',
      })

      // Verify Redis cache updated
      expect(redis.set).toHaveBeenCalledWith(userFluxRedisKey('user-billing-1'), '70')
    })

    it('throws 402 when balance is insufficient', async () => {
      await db.insert(schema.userFlux).values({ userId: 'user-billing-1', flux: 5 })

      await expect(billingService.consumeFluxForLLM({
        userId: 'user-billing-1',
        amount: 10,
      })).rejects.toThrow('Insufficient flux')

      // Verify no side effects
      const [fluxRecord] = await db.select().from(schema.userFlux).where(eq(schema.userFlux.userId, 'user-billing-1'))
      expect(fluxRecord?.flux).toBe(5)

      const txRecords = await db.select().from(schema.fluxTransaction)
      expect(txRecords).toHaveLength(0)
    })
  })

  describe('creditFlux', () => {
    it('credits balance and writes the ledger row in one transaction', async () => {
      const result = await billingService.creditFlux({
        userId: 'user-billing-1',
        amount: 50,
        description: 'Admin grant',
        source: 'admin',
      })

      expect(result.balanceAfter).toBe(50)
      expect(result.balanceBefore).toBe(0)
      expect(result.idempotent).toBe(false)

      // Verify transaction
      const txRecords = await db.select().from(schema.fluxTransaction).where(eq(schema.fluxTransaction.userId, 'user-billing-1'))
      expect(txRecords).toHaveLength(1)
      expect(txRecords[0]).toMatchObject({
        type: 'credit',
        amount: 50,
        balanceBefore: 0,
        balanceAfter: 50,
      })
    })

    it('is idempotent across retries with the same requestId', async () => {
      // ROOT CAUSE:
      //
      // Worker crash window: creditFlux commits the credit, then the
      // grant-batch poller crashes before marking its own state row
      // (e.g. flux_grant_batch_recipient) as granted. On restart the poller
      // re-claims the same row and calls creditFlux again with the same
      // requestId.
      //
      // Before the fix: second call hit the unique index on
      // (user_id, request_id) and threw, the poller's catch block marked
      // the recipient as `failed` despite the user already having been credited.
      // User got the FLUX but the recipient row was stuck in failed.
      //
      // After the fix: second call detects the existing flux_transaction row,
      // returns it as an idempotent success without touching balance or cache.
      // Poller advances to granted normally.
      const requestId = 'campaign-replay-test'

      const first = await billingService.creditFlux({
        userId: 'user-billing-1',
        amount: 100,
        requestId,
        description: 'Replay test',
        source: 'admin',
      })
      expect(first.idempotent).toBe(false)
      expect(first.balanceAfter).toBe(100)

      // Second call with same requestId — simulates crash-recovery retry.
      const second = await billingService.creditFlux({
        userId: 'user-billing-1',
        amount: 100,
        requestId,
        description: 'Replay test',
        source: 'admin',
      })

      expect(second.idempotent).toBe(true)
      // Same record returned, not a fresh credit
      expect(second.fluxTransactionId).toBe(first.fluxTransactionId)
      expect(second.balanceAfter).toBe(first.balanceAfter)

      // Balance must NOT have doubled
      const [fluxRow] = await db.select().from(schema.userFlux).where(eq(schema.userFlux.userId, 'user-billing-1'))
      expect(fluxRow!.flux).toBe(100)

      // Only one ledger row exists (unique index would prevent a second anyway,
      // but verify the function didn't try to insert and silently swallow)
      const txRecords = await db.select().from(schema.fluxTransaction).where(and(
        eq(schema.fluxTransaction.userId, 'user-billing-1'),
        eq(schema.fluxTransaction.requestId, requestId),
      ))
      expect(txRecords).toHaveLength(1)
    })
  })
})
