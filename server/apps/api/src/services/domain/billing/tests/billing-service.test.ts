import type { Database } from '../../../../libs/db'

import { and, eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { mockDB } from '../../../../libs/mock-db'
import { createTestRedis } from '../../../../libs/tests/redis'
import { userFluxRedisKey } from '../../../../utils/redis-keys'
import { createBillingService } from '../billing-service'

import * as schema from '../../../../schemas'

describe('billingService', () => {
  let db: Database
  let redis: ReturnType<typeof createTestRedis>
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
    redis = createTestRedis()
    billingService = createBillingService(db, redis)

    await db.delete(schema.fluxTransaction)
    await db.delete(schema.userFlux).where(eq(schema.userFlux.userId, 'user-billing-1'))
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
      expect(await redis.get(userFluxRedisKey('user-billing-1'))).toBeNull()

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

  it('invalidates the wallet snapshot after a committed payment', async () => {
    await redis.set(userFluxRedisKey('user-billing-1'), JSON.stringify({ flux: 10, unsettledMicroFlux: 0 }))
    await billingService.syncFluxCache('user-billing-1')
    expect(await redis.get(userFluxRedisKey('user-billing-1'))).toBeNull()
  })

  it('keeps a committed credit when the cache write fails', async () => {
    vi.spyOn(redis, 'del').mockRejectedValueOnce(new Error('redis unavailable'))
    const result = await billingService.creditFlux({
      userId: 'user-billing-1',
      amount: 50,
      description: 'grant',
      source: 'test',
    })
    expect(result.balanceAfter).toBe(50)
    const [row] = await db.select().from(schema.userFlux).where(eq(schema.userFlux.userId, 'user-billing-1'))
    expect(row?.flux).toBe(50)
    expect(await db.select().from(schema.fluxTransaction)).toHaveLength(1)
  })

  describe('setFlux', () => {
    it('sets the balance to an absolute value and records an admin_set ledger row', async () => {
      // Start from a known balance so the delta direction is observable.
      await billingService.creditFlux({ userId: 'user-billing-1', amount: 100, description: 'seed', source: 'test' })

      const result = await billingService.setFlux({
        userId: 'user-billing-1',
        balance: 250,
        description: 'admin top-up',
        issuedByUserId: 'admin-1',
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
      expect(tx!.metadata).toMatchObject({ source: 'admin_set', direction: 'credit', requestedBalance: 250, issuedByUserId: 'admin-1' })
    })

    it('can zero out a balance and records the debit direction (the primary testing use case)', async () => {
      await billingService.creditFlux({ userId: 'user-billing-1', amount: 500, description: 'seed', source: 'test' })

      const result = await billingService.setFlux({
        userId: 'user-billing-1',
        balance: 0,
        description: 'admin zero',
        issuedByUserId: 'admin-1',
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
        userId: 'user-billing-1',
        balance: 42,
        description: 'admin set from zero',
        issuedByUserId: 'admin-1',
      })

      expect(result.balanceBefore).toBe(0)
      expect(result.balanceAfter).toBe(42)
      // Invalidate, not write: next getFlux miss reloads truth from Postgres.
      expect(del).toHaveBeenCalledWith(userFluxRedisKey('user-billing-1'))
      expect(await redis.get(userFluxRedisKey('user-billing-1'))).toBeNull()
    })
  })
})
