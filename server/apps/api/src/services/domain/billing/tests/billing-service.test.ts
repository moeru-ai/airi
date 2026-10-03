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
  const defaults: Record<string, number> = { INITIAL_USER_FLUX: 100, FLUX_PER_REQUEST: 1, ...overrides }
  return {
    get: vi.fn(async (key: string) => defaults[key]),
    getOrThrow: vi.fn(async (key: string) => defaults[key]),
    getOptional: vi.fn(async (key: string) => defaults[key] ?? null),
    set: vi.fn(),
  } as any
}

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
    billingService = createBillingService(db, redis, createMockConfigKV())

    await db.delete(schema.fluxTransaction)
    await db.delete(schema.fluxUsage)
    await db.delete(schema.userFlux).where(eq(schema.userFlux.userId, 'user-billing-1'))
  })

  it('saves authorization before dispatch without writing diagnostic logs or debiting the wallet', async () => {
    await db.insert(schema.userFlux).values({ userId: 'user-billing-1', flux: 100 })
    const input = { userId: 'user-billing-1', requestId: 'authorized', model: 'model', policy: { minimumBalance: 2, costPricing: { openrouter: { fluxPerUsd: 1000, multiplier: 1 } } } }
    await billingService.beginLlmRequest(input)
    expect(await db.select().from(schema.fluxUsage)).toEqual([expect.objectContaining({
      requestId: 'authorized',
      method: 'unresolved',
      billingStatus: 'pending',
      pendingReason: 'awaiting_result',
      pricing: { minimumBalance: 2, costPricing: { openrouter: { fluxPerUsd: 1000, multiplier: 1 } } },
    })])
    expect(await db.select().from(schema.llmRequestLog)).toHaveLength(0)
    expect(await db.select().from(schema.fluxTransaction)).toHaveLength(0)
    expect((await db.select().from(schema.userFlux))[0].flux).toBe(100)
    await expect(billingService.beginLlmRequest({ ...input, policy: { minimumBalance: 99 } })).rejects.toThrow()
    expect((await db.select().from(schema.fluxUsage))[0].pricing).toEqual(input.policy)
  })

  describe('settleLlmCost', () => {
    const pricing = { fluxPerUsd: 1000, multiplier: 1.5 }
    const receipt = (requestId: string, cost: number | undefined) => ({
      provider: 'openrouter',
      userId: 'user-billing-1',
      requestId,
      model: 'openai/gpt-5-mini',
      pricing,
      observation: { status: 200, durationMs: 100, gateway: 'openrouter.ai' },
      usage: { source: 'provider_reported' as const, generationId: `gen-${requestId}`, costUsd: cost, providerUsage: { cost }, promptTokens: 100, completionTokens: 20 },
    })

    it('cancels only the matching unresolved intake and rejects later settlement', async () => {
      await db.insert(schema.userFlux).values({ userId: 'user-billing-1', flux: 100 })
      const input = receipt('not-dispatched', 0.002)
      await billingService.beginLlmRequest({ ...input, policy: { minimumBalance: 1, costPricing: { openrouter: pricing } } })
      await billingService.cancelUndispatchedLlmRequest({ ...input, userId: 'another-user' })
      expect((await db.select().from(schema.fluxUsage))[0].billingStatus).toBe('pending')
      await billingService.cancelUndispatchedLlmRequest(input)
      const [cancelled] = await db.select().from(schema.fluxUsage)
      await billingService.cancelUndispatchedLlmRequest(input)
      expect(await db.select().from(schema.fluxUsage)).toEqual([cancelled])
      expect(cancelled).toMatchObject({ billingStatus: 'cancelled', pendingReason: 'not_dispatched' })
      await expect(billingService.settleLlmCost(input)).rejects.toThrow('Cannot settle an undispatched request')
      expect(await db.select().from(schema.fluxTransaction)).toHaveLength(0)
      expect((await db.select().from(schema.userFlux))[0].flux).toBe(100)
    })

    it('does not cancel a received provider receipt', async () => {
      await db.insert(schema.userFlux).values({ userId: 'user-billing-1', flux: 100 })
      const input = receipt('received', undefined)
      await billingService.settleLlmCost(input)
      const [pending] = await db.select().from(schema.fluxUsage)
      await billingService.cancelUndispatchedLlmRequest(input)
      expect(await db.select().from(schema.fluxUsage)).toEqual([pending])
      expect(pending.billingStatus).toBe('pending')
    })

    it('reports receipt intake transaction failures with correlation fields', async () => {
      const output = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const transaction = vi.spyOn(db, 'transaction').mockRejectedValueOnce(new Error('receipt storage unavailable'))
      try {
        await expect(billingService.settleLlmCost(receipt('failed-intake', 0.002))).rejects.toThrow('receipt storage unavailable')
        expect(output).toHaveBeenCalledWith(expect.stringContaining('"event":"flux.usage"'))
        expect(output).toHaveBeenCalledWith(expect.stringContaining('"requestId":"failed-intake"'))
        expect(output).toHaveBeenCalledWith(expect.stringContaining('"billingStatus":"failed"'))
        expect(await db.select().from(schema.fluxUsage)).toHaveLength(0)
        expect(await db.select().from(schema.fluxTransaction)).toHaveLength(0)
      }
      finally {
        transaction.mockRestore()
        output.mockRestore()
      }
    })

    // https://github.com/moeru-ai/airi/pull/2644
    it('settles normalized cost from another provider without parsing its wire fields', async () => {
      await db.insert(schema.userFlux).values({ userId: 'user-billing-1', flux: 100 })
      const input = {
        ...receipt('other-provider', 0.002),
        provider: 'another-gateway',
        usage: { source: 'provider_reported' as const, generationId: 'other-123', costUsd: 0.002, providerUsage: { invoice_amount: 'different-wire-format' } },
      }
      expect(await billingService.settleLlmCost(input)).toMatchObject({ charged: 3, requested: 3, pending: false })
      const [record] = await db.select().from(schema.fluxUsage)
      expect(record).toMatchObject({ billingProvider: 'another-gateway', costUsd: '0.002', walletDebitFlux: 3 })
      const [ledger] = await db.select().from(schema.fluxTransaction)
      expect(ledger.usageId).toBe(record.id)
      expect(record).toMatchObject({ costSource: 'provider_reported', generationId: 'other-123' })
    })

    it('pins authorized cost prices and sanitizes evidence independently of diagnostic logs', async () => {
      await db.insert(schema.userFlux).values({ userId: 'user-billing-1', flux: 100 })
      const input = receipt('authorized-cost', 0.002)
      await billingService.beginLlmRequest({ ...input, policy: { minimumBalance: 1, costPricing: { openrouter: pricing } } })
      await billingService.settleLlmCost({ ...input, pricing: { fluxPerUsd: 999, multiplier: 999 }, usage: { ...input.usage, providerUsage: { cost: 0.002, custom: { units: 4, api_key: 'private' }, messages: ['private'] } } })
      const [entry] = await db.select().from(schema.fluxUsage)
      expect(entry).toMatchObject({ walletDebitFlux: 3, pricing, providerUsage: { cost: 0.002, custom: { units: 4 } } })
      expect(JSON.stringify(entry.providerUsage)).not.toContain('private')
      expect(await db.select().from(schema.llmRequestLog)).toHaveLength(0)
    })

    it('accepts normalized model-price-table evidence without a token-rate fallback', async () => {
      await db.insert(schema.userFlux).values({ userId: 'user-billing-1', flux: 100 })
      const input = receipt('price-table', 0.002)
      await billingService.settleLlmCost({
        ...input,
        provider: 'explicit-price-table-adapter',
        usage: { ...input.usage, source: 'model_price_table', providerUsage: { priceTableVersion: 'v1', inputTokens: 100, outputTokens: 20 } },
      })
      const [entry] = await db.select().from(schema.fluxUsage)
      expect(entry).toMatchObject({ walletDebitFlux: 3, costUsd: '0.002', costSource: 'model_price_table', providerUsage: { priceTableVersion: 'v1' } })
      expect((await db.select().from(schema.userFlux))[0].flux).toBe(97)
    })

    it('debits reported cost and keeps the provider receipt and price snapshot', async () => {
      await db.insert(schema.userFlux).values({ userId: 'user-billing-1', flux: 100 })
      expect(await billingService.settleLlmCost(receipt('cost-1', 0.002)))
        .toMatchObject({ charged: 3, requested: 3, pending: false })
      const [record] = await db.select().from(schema.fluxUsage)
      expect(record).toMatchObject({ billingProvider: 'openrouter', billingStatus: 'settled', costUsd: '0.002', requestedDebitFlux: 3, pricing, providerUsage: { cost: 0.002 }, walletDebitFlux: 3 })
      const [ledger] = await db.select().from(schema.fluxTransaction)
      expect(ledger.usageId).toBe(record.id)
      expect(ledger.amount).toBe(record.walletDebitFlux)
      expect(ledger.metadata).not.toHaveProperty('billing')
      expect(record).not.toHaveProperty('evidence')
      expect(record).not.toHaveProperty('schemaVersion')
      expect(record).toMatchObject({ costSource: 'provider_reported' })
      expect(await redis.get(userFluxRedisKey('user-billing-1'))).toBeNull()
    })

    it('accumulates small fees and posts a debit only at the whole Flux threshold', async () => {
      await db.insert(schema.userFlux).values({ userId: 'user-billing-1', flux: 100 })
      for (let index = 0; index < 3; index++) {
        expect(await billingService.settleLlmCost(receipt(`small-${index}`, 0.0002))).toMatchObject({ charged: 0, costMicroFlux: 300_000 })
      }
      expect(await db.select().from(schema.fluxTransaction)).toHaveLength(0)
      expect(await billingService.settleLlmCost(receipt('small-4', 0.0002))).toMatchObject({ charged: 1 })
      expect((await db.select().from(schema.userFlux))[0]).toMatchObject({ flux: 99, unsettledMicroFlux: 200_000 })
      expect(await db.select().from(schema.fluxTransaction)).toHaveLength(1)
    })

    it('settles zero cost at zero even if another request depleted the balance', async () => {
      await db.insert(schema.userFlux).values({ userId: 'user-billing-1', flux: 0 })
      expect(await billingService.settleLlmCost(receipt('free', 0))).toMatchObject({ charged: 0, requested: 0, pending: false })
      const [wallet] = await db.select().from(schema.userFlux)
      expect(wallet).toMatchObject({ flux: 0 })
      const [record] = await db.select().from(schema.fluxUsage)
      expect(record).toMatchObject({ billingStatus: 'settled', costUsd: '0', walletDebitFlux: 0 })
      expect(await db.select().from(schema.fluxTransaction)).toHaveLength(0)
    })

    it.each([0, 2])('counts underfunded settlements once with balance %s', async (balance) => {
      const ignored = { add: vi.fn() }
      const insufficient = { add: vi.fn() }
      const service = createBillingService(db, redis, createMockConfigKV(), {
        stripeCheckoutCreated: ignored,
        stripeCheckoutCompleted: ignored,
        stripeEvents: ignored,
        stripeRevenue: ignored,
        fluxInsufficientBalance: insufficient,
        fluxCredited: ignored,
        fluxUnbilled: ignored,
        ttsChars: ignored,
        ttsPreflightRejections: ignored,
      })
      await db.insert(schema.userFlux).values({ userId: 'user-billing-1', flux: balance })
      await service.settleLlmCost(receipt('underfunded', 0.002))
      await service.settleLlmCost(receipt('underfunded', 0.002))
      expect(insufficient.add).toHaveBeenCalledExactlyOnceWith(1)
      expect(await db.select().from(schema.fluxTransaction)).toHaveLength(balance === 0 ? 0 : 1)
    })

    it('keeps missing cost pending and reconciles once with the original price', async () => {
      await db.insert(schema.userFlux).values({ userId: 'user-billing-1', flux: 100 })
      expect(await billingService.settleLlmCost(receipt('pending', undefined))).toMatchObject({ charged: 0, requested: 0, pending: true })
      expect(await db.select().from(schema.fluxTransaction)).toHaveLength(0)
      const [pending] = await db.select().from(schema.fluxUsage)
      expect(pending).toMatchObject({ billingStatus: 'pending', generationId: 'gen-pending', pricing })
      const recovered = { ...receipt('pending', 0.002), pricing: { fluxPerUsd: 2000, multiplier: 9 } }
      expect(await billingService.settleLlmCost(recovered)).toMatchObject({ charged: 3, requested: 3, pending: false })
      expect(await billingService.settleLlmCost(recovered)).toMatchObject({ charged: 3, requested: 3, pending: false })
      expect(await db.select().from(schema.fluxTransaction)).toHaveLength(1)
      const [wallet] = await db.select().from(schema.userFlux)
      expect(wallet.flux).toBe(97)
    })

    it('persists missing cost without a second wallet-lock transaction', async () => {
      await db.insert(schema.userFlux).values({ userId: 'user-billing-1', flux: 100 })
      const transaction = vi.spyOn(db, 'transaction')
      try {
        expect(await billingService.settleLlmCost(receipt('pending-once', undefined))).toMatchObject({ charged: 0, requested: 0, pending: true })
        expect(transaction).toHaveBeenCalledTimes(1)
        expect(await db.select().from(schema.fluxUsage)).toEqual([expect.objectContaining({ billingStatus: 'pending' })])
        expect(await db.select().from(schema.fluxTransaction)).toHaveLength(0)
      }
      finally {
        transaction.mockRestore()
      }
    })

    it('returns a settled replay without a second wallet-lock transaction', async () => {
      await db.insert(schema.userFlux).values({ userId: 'user-billing-1', flux: 100 })
      const input = receipt('settled-once', 0.002)
      await billingService.settleLlmCost(input)
      const transaction = vi.spyOn(db, 'transaction')
      try {
        expect(await billingService.settleLlmCost(input)).toMatchObject({ charged: 3, requested: 3, pending: false })
        expect(transaction).toHaveBeenCalledTimes(1)
        expect(await db.select().from(schema.fluxTransaction)).toHaveLength(1)
        expect((await db.select().from(schema.userFlux))[0].flux).toBe(97)
      }
      finally {
        transaction.mockRestore()
      }
    })

    it('rejects reconciliation with a different generation ID', async () => {
      await db.insert(schema.userFlux).values({ userId: 'user-billing-1', flux: 100 })
      await billingService.settleLlmCost(receipt('pending', undefined))
      const wrong = receipt('pending', 0.002)
      wrong.usage.generationId = 'gen-other'
      await expect(billingService.settleLlmCost(wrong)).rejects.toThrow('Generation ID does not match')
      expect(await db.select().from(schema.fluxTransaction)).toHaveLength(0)
    })

    it('keeps interrupted and adapter-deferred receipts pending without debiting the wallet', async () => {
      await db.insert(schema.userFlux).values({ userId: 'user-billing-1', flux: 100 })
      expect(await billingService.settleLlmCost({ ...receipt('interrupt', 0.002), pendingReason: 'stream_interrupted' })).toMatchObject({ pending: true })
      expect(await billingService.settleLlmCost({ ...receipt('deferred', 0), usage: { source: 'provider_reported' as const, generationId: 'gen-deferred', pendingReason: 'unsupported_cost_basis' } })).toMatchObject({ pending: true })
      const [wallet] = await db.select().from(schema.userFlux)
      expect(wallet).toMatchObject({ flux: 100 })
    })

    it('serializes concurrent rounded settlements and never charges a replay twice', async () => {
      await db.insert(schema.userFlux).values({ userId: 'user-billing-1', flux: 100 })
      await Promise.all([
        billingService.settleLlmCost(receipt('same', 0.0004)),
        billingService.settleLlmCost(receipt('same', 0.0004)),
        billingService.settleLlmCost(receipt('other', 0.0004)),
      ])
      const [wallet] = await db.select().from(schema.userFlux)
      expect(wallet).toMatchObject({ flux: 99, unsettledMicroFlux: 200_000 })
      expect(await db.select().from(schema.fluxUsage)).toHaveLength(2)
      expect(await db.select().from(schema.fluxTransaction)).toHaveLength(1)
    })

    it.each([undefined, 0.002])('rejects a provider change for pending or settled cost: %s', async (cost) => {
      await db.insert(schema.userFlux).values({ userId: 'user-billing-1', flux: 100 })
      await billingService.settleLlmCost(receipt('same-provider', cost))
      await expect(billingService.settleLlmCost({ ...receipt('same-provider', 0.002), provider: 'another-gateway' }))
        .rejects
        .toThrow('Provider does not match')
      const [record] = await db.select().from(schema.fluxUsage)
      expect(record.billingProvider).toBe('openrouter')
    })

    it('records unpaid whole Flux and does not debit again on replay', async () => {
      await db.insert(schema.userFlux).values({ userId: 'user-billing-1', flux: 2 })
      expect(await billingService.settleLlmCost(receipt('partial', 0.002))).toMatchObject({ charged: 2, requested: 3, pending: false })
      expect(await billingService.settleLlmCost(receipt('partial', 0.002))).toMatchObject({ charged: 2, requested: 3, pending: false })
      const [ledger] = await db.select().from(schema.fluxTransaction)
      expect(ledger.metadata).toMatchObject({ unsettledBefore: 3_000_000, unsettledAfter: 1_000_000 })
    })

    it('rolls back usage and wallet changes when the debit operation conflicts', async () => {
      await db.insert(schema.userFlux).values({ userId: 'user-billing-1', flux: 100 })
      const input = receipt('collision', 0.002)
      await billingService.beginLlmRequest({ ...input, policy: { minimumBalance: 1, costPricing: { openrouter: pricing } } })
      const [usage] = await db.select().from(schema.fluxUsage)
      await db.insert(schema.fluxTransaction).values({
        userId: input.userId,
        type: 'debit',
        amount: 1,
        balanceBefore: 101,
        balanceAfter: 100,
        description: 'test',
        operationId: `usage:${usage.id}:post`,
      })
      await expect(billingService.settleLlmCost(input)).rejects.toThrow()
      expect((await db.select().from(schema.userFlux))[0]).toMatchObject({ flux: 100, unsettledMicroFlux: 0 })
      expect((await db.select().from(schema.fluxUsage))[0]).toMatchObject({ billingStatus: 'pending', costMicroFlux: null })
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
    await billingService.syncFluxCache('user-billing-1', 123)
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
