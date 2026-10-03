import type { Database } from '../../../../libs/db'

import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, expect, it } from 'vitest'

import { mockDB } from '../../../../libs/mock-db'
import { createTestRedis } from '../../../../libs/tests/redis'
import { createBillingService } from '../billing-service'
import { createLlmBillingService } from '../llm-billing'

import * as schema from '../../../../schemas'

let db: Database
let billing: ReturnType<typeof createBillingService>
let llm: ReturnType<typeof createLlmBillingService>
const pricing = { fluxPerUsd: 1000, multiplier: 1 }
const input = (requestId: string, costUsd: number | undefined) => ({ userId: 'wallet', requestId, model: 'model', provider: 'gateway', pricing, usage: { source: 'provider_reported' as const, generationId: requestId, costUsd }, observation: { status: 200, durationMs: 1 } })

beforeAll(async () => {
  db = await mockDB(schema)
})
beforeEach(async () => {
  await db.delete(schema.fluxTransaction)
  await db.delete(schema.llmBillingReceipt)
  await db.delete(schema.userFlux)
  await db.insert(schema.userFlux).values({ userId: 'wallet', flux: 10 })
  billing = createBillingService(db, createTestRedis())
  llm = createLlmBillingService(db, billing)
})

it('keeps authorization and pending provider evidence outside the financial ledger', async () => {
  await llm.beginLlmRequest({ userId: 'wallet', requestId: 'pending', model: 'model', policy: { minimumBalance: 1, costPricing: { gateway: pricing } } })
  expect(await llm.settleLlmCost(input('pending', undefined))).toMatchObject({ pending: true })
  expect(await db.select().from(schema.fluxTransaction)).toHaveLength(0)
  const [receipt] = await db.select().from(schema.llmBillingReceipt)
  expect(receipt).toMatchObject({ billingStatus: 'pending', pendingReason: 'missing_or_invalid_cost', costMicroFlux: null, generationId: 'pending' })
  expect(await llm.settleLlmCost({ ...input('pending', 0.0006), pricing: { fluxPerUsd: 99999, multiplier: 2 } })).toMatchObject({ costMicroFlux: 600_000, charged: 0 })
  expect(await billing.getWallet('wallet')).toMatchObject({ flux: 10, unsettledMicroFlux: 600_000 })
})

it('cancels an undispatched receipt and refuses subsequent fee posting', async () => {
  await llm.beginLlmRequest({ userId: 'wallet', requestId: 'cancel', model: 'model', policy: { minimumBalance: 1, costPricing: { gateway: pricing } } })
  await llm.cancelUndispatchedLlmRequest({ userId: 'wallet', requestId: 'cancel' })
  await expect(llm.settleLlmCost(input('cancel', 0.001))).rejects.toThrow('undispatched')
  expect(await db.select().from(schema.fluxTransaction)).toHaveLength(0)
})

it('preserves sanitized service evidence without copying it into wallet accruals', async () => {
  await llm.settleLlmCost({ ...input('receipt', 0.001), observation: { status: 200, durationMs: 1, attemptId: 'attempt' }, usage: { ...input('receipt', 0.001).usage, providerUsage: { cost: 0.001 } } })
  const [receipt] = await db.select().from(schema.llmBillingReceipt)
  expect(receipt).toMatchObject({ attemptId: 'attempt', model: 'model', billingStatus: 'posted', pricing, providerUsage: { cost: 0.001 }, requestedFlux: null, chargedFlux: null })
  const [accrual] = await db.select().from(schema.fluxTransaction).where(eq(schema.fluxTransaction.type, 'accrual'))
  expect(accrual).toMatchObject({ sourceType: 'llm', sourceId: 'receipt', amountMicroFlux: 1_000_000, metadata: null })
  await expect(llm.settleLlmCost({ ...input('receipt', 0.001), provider: 'other' })).rejects.toThrow('Provider')
  await expect(llm.settleLlmCost({ ...input('receipt', 0.001), usage: { ...input('receipt', 0.001).usage, generationId: 'other' } })).rejects.toThrow('Generation')
})

it('rolls back both ledger events and wallet state when the owning transaction fails', async () => {
  const command = { userId: 'wallet', source: { type: 'external', id: 'rollback' }, amountMicroFlux: 1_500_000 }
  await expect(db.transaction(async (tx) => {
    await billing.postFluxUsage(command, tx)
    throw new Error('owner failed')
  })).rejects.toThrow('owner failed')
  expect(await db.select().from(schema.fluxTransaction)).toHaveLength(0)
  expect(await billing.getWallet('wallet')).toMatchObject({ flux: 10, unsettledMicroFlux: 0 })
  expect(await billing.postFluxUsage(command)).toMatchObject({ charged: 1, unsettledMicroFlux: 500_000, replay: false })
})

it('preserves pending authorization when financial posting fails', async () => {
  await llm.beginLlmRequest({ userId: 'wallet', requestId: 'overflow', model: 'model', policy: { minimumBalance: 1, costPricing: { gateway: pricing } } })
  await db.update(schema.userFlux).set({ unsettledMicroFlux: Number.MAX_SAFE_INTEGER })
  await expect(llm.settleLlmCost(input('overflow', 0.001))).rejects.toThrow()
  const [receipt] = await db.select().from(schema.llmBillingReceipt)
  expect(receipt).toMatchObject({ billingStatus: 'pending', pendingReason: 'awaiting_result', costMicroFlux: null, billingProvider: null })
  expect(await db.select().from(schema.fluxTransaction)).toHaveLength(0)
  expect(await billing.getWallet('wallet')).toMatchObject({ flux: 10, unsettledMicroFlux: Number.MAX_SAFE_INTEGER })
})
