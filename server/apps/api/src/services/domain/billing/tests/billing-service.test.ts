import type { Database } from '../../../../libs/db'
import type { createConfigKVService } from '../../../adapters/config-kv'

import { and, eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { mockDB } from '../../../../libs/mock-db'
import { createTestRedis } from '../../../../libs/tests/redis'
import { userFluxRedisKey } from '../../../../utils/redis-keys'
import { createBillingService } from '../billing-service'

import * as schema from '../../../../schemas'

function createMockConfigKV(overrides: Record<string, number> = {}): ReturnType<typeof createConfigKVService> {
  const defaults: Record<string, number> = { FLUX_PER_REQUEST: 1, INITIAL_USER_FLUX: 100, ...overrides }
  return {
    get: vi.fn(async (key: string) => defaults[key]),
    getOptional: vi.fn(async (key: string) => defaults[key] ?? null),
    getOrThrow: vi.fn(async (key: string) => defaults[key]),
    set: vi.fn(),
  } as any
}

describe('billingService', () => {
  let db: Database
  let redis: ReturnType<typeof createTestRedis>
  let set: ReturnType<typeof vi.spyOn>
  let billingService: ReturnType<typeof createBillingService>

  beforeAll(async () => {
    db = await mockDB(schema)

    await db.insert(schema.user).values({
      email: 'billing@example.com',
      id: 'user-billing-1',
      name: 'Billing User',
    })
  })

  beforeEach(async () => {
    redis = createTestRedis()
    set = vi.spyOn(redis, 'set')
    billingService = createBillingService(db, redis, createMockConfigKV())

    await db.delete(schema.fluxTransaction)
    await db.delete(schema.userFlux).where(eq(schema.userFlux.userId, 'user-billing-1'))
    await db.delete(schema.stripeCheckoutSession).where(eq(schema.stripeCheckoutSession.stripeSessionId, 'sess-billing-1'))

    await db.insert(schema.stripeCheckoutSession).values({
      amountTotal: 500,
      currency: 'usd',
      fluxCredited: false,
      mode: 'payment',
      paymentStatus: 'paid',
      status: 'complete',
      stripeSessionId: 'sess-billing-1',
      userId: 'user-billing-1',
    })
  })

  describe('creditFluxFromStripeCheckout', () => {
    it('credits flux, records transaction, and enqueues outbox events in one transaction', async () => {
      const result = await billingService.creditFluxFromStripeCheckout({
        amountTotal: 500,
        currency: 'usd',
        fluxAmount: 50,
        stripeEventId: 'stripe-evt-1',
        stripeSessionId: 'sess-billing-1',
        userId: 'user-billing-1',
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
        source: 'stripe.checkout.completed',
        stripeEventId: 'stripe-evt-1',
        stripeSessionId: 'sess-billing-1',
      })

      // Verify stripe session marked as credited
      const [sessionRecord] = await db.select().from(schema.stripeCheckoutSession).where(eq(schema.stripeCheckoutSession.stripeSessionId, 'sess-billing-1'))
      expect(sessionRecord?.fluxCredited).toBe(true)

      // Verify Redis cache updated
      expect(set).toHaveBeenCalledWith(userFluxRedisKey('user-billing-1'), '50')
    })

    it('is idempotent when the checkout session was already credited', async () => {
      await billingService.creditFluxFromStripeCheckout({
        amountTotal: 500,
        currency: 'usd',
        fluxAmount: 50,
        stripeEventId: 'stripe-evt-1',
        stripeSessionId: 'sess-billing-1',
        userId: 'user-billing-1',
      })

      const second = await billingService.creditFluxFromStripeCheckout({
        amountTotal: 500,
        currency: 'usd',
        fluxAmount: 50,
        stripeEventId: 'stripe-evt-1',
        stripeSessionId: 'sess-billing-1',
        userId: 'user-billing-1',
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
      await db.insert(schema.userFlux).values({ flux: 100, userId: 'user-billing-1' })

      const result = await billingService.consumeFluxForLLM({
        amount: 30,
        completionTokens: 80,
        description: 'gpt-4',
        promptTokens: 120,
        requestId: 'req-1',
        userId: 'user-billing-1',
      })

      expect(result).toEqual({ charged: 30, flux: 70, requested: 30, userId: 'user-billing-1' })

      // Verify DB balance
      const [fluxRecord] = await db.select().from(schema.userFlux).where(eq(schema.userFlux.userId, 'user-billing-1'))
      expect(fluxRecord?.flux).toBe(70)

      // Ledger row written inline (no async consumer involved post-refactor)
      const [txRecord] = await db.select().from(schema.fluxTransaction).where(and(
        eq(schema.fluxTransaction.userId, 'user-billing-1'),
        eq(schema.fluxTransaction.requestId, 'req-1'),
      ))
      expect(txRecord).toMatchObject({
        amount: 30,
        balanceAfter: 70,
        balanceBefore: 100,
        description: 'gpt-4',
        requestId: 'req-1',
        type: 'debit',
        userId: 'user-billing-1',
      })
      expect(txRecord?.metadata).toMatchObject({
        completionTokens: 80,
        promptTokens: 120,
        source: 'llm.request',
      })

      // Verify Redis cache updated
      expect(set).toHaveBeenCalledWith(userFluxRedisKey('user-billing-1'), '70')
    })

    // ROOT CAUSE:
    //
    // Before: when `0 < balance < amount`, debitFlux threw and rolled back the
    // whole tx. The streaming proxy had already delivered the response, so the
    // unpaid request was logged but the user's balance was untouched.
    // A scripted attacker on a partial balance could replay forever — balance
    // never moved, line 129 (`flux <= 0`) kept letting requests through, and
    // every call landed in the catch path crediting `fluxUnbilled` for the
    // full amount.
    //
    // After: balance is drained to zero, the ledger records `amount = charged`
    // plus `metadata.requestedAmount` / `metadata.unbilled`, and the caller
    // gets `charged < requested` so it can attribute the leak to
    // `fluxUnbilled{reason="partial_debit_drained"}`. The next request from
    // the same user is rejected at the pre-flight gate.
    it('partial-debits when balance is below the requested amount and writes unbilled metadata (Issue: unpaid-usage-exploit)', async () => {
      await db.insert(schema.userFlux).values({ flux: 5, userId: 'user-billing-1' })

      const result = await billingService.consumeFluxForLLM({
        amount: 38,
        description: 'gpt-4',
        requestId: 'req-partial',
        userId: 'user-billing-1',
      })

      expect(result).toEqual({ charged: 5, flux: 0, requested: 38, userId: 'user-billing-1' })

      const [fluxRecord] = await db.select().from(schema.userFlux).where(eq(schema.userFlux.userId, 'user-billing-1'))
      expect(fluxRecord?.flux).toBe(0)

      const [txRecord] = await db.select().from(schema.fluxTransaction).where(and(
        eq(schema.fluxTransaction.userId, 'user-billing-1'),
        eq(schema.fluxTransaction.requestId, 'req-partial'),
      ))
      expect(txRecord).toMatchObject({
        amount: 5,
        balanceAfter: 0,
        balanceBefore: 5,
        type: 'debit',
      })
      expect(txRecord?.metadata).toMatchObject({
        requestedAmount: 38,
        source: 'llm.request',
        unbilled: 33,
      })

      // Redis cache reflects the zero balance, so the next pre-flight gate
      // (`flux < fallbackRate`) rejects immediately.
      expect(set).toHaveBeenCalledWith(userFluxRedisKey('user-billing-1'), '0')
    })

    it('throws 402 when balance is already zero (no ledger row, no balance change)', async () => {
      await db.insert(schema.userFlux).values({ flux: 0, userId: 'user-billing-1' })

      await expect(billingService.consumeFluxForLLM({
        amount: 10,
        userId: 'user-billing-1',
      })).rejects.toThrow('Insufficient flux')

      const [fluxRecord] = await db.select().from(schema.userFlux).where(eq(schema.userFlux.userId, 'user-billing-1'))
      expect(fluxRecord?.flux).toBe(0)

      const txRecords = await db.select().from(schema.fluxTransaction)
      expect(txRecords).toHaveLength(0)
    })

    it('idempotent replay returns the historical charge without re-debiting (partial debits stay partial on retry)', async () => {
      await db.insert(schema.userFlux).values({ flux: 5, userId: 'user-billing-1' })

      const first = await billingService.consumeFluxForLLM({
        amount: 38,
        requestId: 'req-replay',
        userId: 'user-billing-1',
      })
      const second = await billingService.consumeFluxForLLM({
        amount: 38,
        requestId: 'req-replay',
        userId: 'user-billing-1',
      })

      expect(first.charged).toBe(5)
      expect(first.flux).toBe(0)
      // Replay reflects the original partial outcome — equal `charged` and
      // `requested` prevent the streaming caller from double-firing
      // `fluxUnbilled` on retries.
      expect(second.charged).toBe(5)
      expect(second.requested).toBe(5)
      expect(second.flux).toBe(0)

      // Ledger has exactly one row for `req-replay`
      const txRecords = await db.select().from(schema.fluxTransaction).where(and(
        eq(schema.fluxTransaction.userId, 'user-billing-1'),
        eq(schema.fluxTransaction.requestId, 'req-replay'),
      ))
      expect(txRecords).toHaveLength(1)
    })
  })

  describe('creditFlux', () => {
    it('credits balance and writes the ledger row in one transaction', async () => {
      const result = await billingService.creditFlux({
        amount: 50,
        description: 'Admin grant',
        source: 'admin',
        userId: 'user-billing-1',
      })

      expect(result.balanceAfter).toBe(50)
      expect(result.balanceBefore).toBe(0)
      expect(result.idempotent).toBe(false)

      // Verify transaction
      const txRecords = await db.select().from(schema.fluxTransaction).where(eq(schema.fluxTransaction.userId, 'user-billing-1'))
      expect(txRecords).toHaveLength(1)
      expect(txRecords[0]).toMatchObject({
        amount: 50,
        balanceAfter: 50,
        balanceBefore: 0,
        type: 'credit',
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
        amount: 100,
        description: 'Replay test',
        requestId,
        source: 'admin',
        userId: 'user-billing-1',
      })
      expect(first.idempotent).toBe(false)
      expect(first.balanceAfter).toBe(100)

      // Second call with same requestId — simulates crash-recovery retry.
      const second = await billingService.creditFlux({
        amount: 100,
        description: 'Replay test',
        requestId,
        source: 'admin',
        userId: 'user-billing-1',
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

  describe('setFlux', () => {
    it('sets the balance to an absolute value and records an admin_set ledger row', async () => {
      // Start from a known balance so the delta direction is observable.
      await billingService.creditFlux({ amount: 100, description: 'seed', source: 'test', userId: 'user-billing-1' })

      const result = await billingService.setFlux({
        balance: 250,
        description: 'admin top-up',
        issuedByUserId: 'admin-1',
        userId: 'user-billing-1',
      })

      expect(result.balanceBefore).toBe(100)
      expect(result.balanceAfter).toBe(250)

      const [fluxRow] = await db.select().from(schema.userFlux).where(eq(schema.userFlux.userId, 'user-billing-1'))
      expect(fluxRow!.flux).toBe(250)

      const [tx] = await db.select().from(schema.fluxTransaction).where(eq(schema.fluxTransaction.id, result.fluxTransactionId))
      expect(tx!.type).toBe('admin_set')
      expect(tx!.amount).toBe(150)
      expect(tx!.balanceBefore).toBe(100)
      expect(tx!.balanceAfter).toBe(250)
      expect(tx!.metadata).toMatchObject({ direction: 'credit', issuedByUserId: 'admin-1', requestedBalance: 250, source: 'admin_set' })
    })

    it('can zero out a balance and records the debit direction (the primary testing use case)', async () => {
      await billingService.creditFlux({ amount: 500, description: 'seed', source: 'test', userId: 'user-billing-1' })

      const result = await billingService.setFlux({
        balance: 0,
        description: 'admin zero',
        issuedByUserId: 'admin-1',
        userId: 'user-billing-1',
      })

      expect(result.balanceBefore).toBe(500)
      expect(result.balanceAfter).toBe(0)

      const [fluxRow] = await db.select().from(schema.userFlux).where(eq(schema.userFlux.userId, 'user-billing-1'))
      expect(fluxRow!.flux).toBe(0)

      const [tx] = await db.select().from(schema.fluxTransaction).where(eq(schema.fluxTransaction.id, result.fluxTransactionId))
      expect(tx!.type).toBe('admin_set')
      expect(tx!.amount).toBe(500)
      expect(tx!.metadata).toMatchObject({ direction: 'debit', requestedBalance: 0 })
    })

    it('initializes a user_flux row when none exists and invalidates the Redis cache', async () => {
      // Pre-warm the cache with a stale value to prove setFlux drops it.
      await redis.set(userFluxRedisKey('user-billing-1'), '999')
      const del = vi.spyOn(redis, 'del')

      const result = await billingService.setFlux({
        balance: 42,
        description: 'admin set from zero',
        issuedByUserId: 'admin-1',
        userId: 'user-billing-1',
      })

      expect(result.balanceBefore).toBe(0)
      expect(result.balanceAfter).toBe(42)
      // Invalidate, not write: next getFlux miss reloads truth from Postgres.
      expect(del).toHaveBeenCalledWith(userFluxRedisKey('user-billing-1'))
      expect(await redis.get(userFluxRedisKey('user-billing-1'))).toBeNull()
    })
  })
})
