import type { Database } from '../../../../libs/db'

import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { mockDB } from '../../../../libs/mock-db'
import { createTestRedis } from '../../../../libs/tests/redis'
import { fluxTransaction, llmBillingReceipt, speechBillingReceipt, userFlux } from '../../../../schemas'
import { createConfigKVService } from '../../../adapters/config-kv'
import { createConfigKVStore } from '../../../adapters/config-kv/store'
import { createBillingService } from '../billing-service'
import { createLlmBillingService } from '../llm-billing'
import { SpeechBilling } from '../speech-billing'

import * as schema from '../../../../schemas'

describe('shared Flux usage', () => {
  let db: Database
  let billing: ReturnType<typeof createBillingService>
  let llmBilling: ReturnType<typeof createLlmBillingService>
  let speech: SpeechBilling
  const pricing = { fluxPerUsd: 1000, multiplier: 1 }
  const speechPricing = { fluxPer1kChars: 1 }
  const llm = (requestId: string, costUsd: number | undefined) => ({
    userId: 'wallet',
    requestId,
    provider: 'gateway',
    model: 'llm-model',
    pricing,
    usage: { source: 'provider_reported' as const, costUsd, generationId: requestId },
    observation: { status: 200, durationMs: 1 },
  })

  beforeAll(async () => {
    db = await mockDB(schema)
  })
  beforeEach(async () => {
    await db.delete(fluxTransaction)
    await db.delete(llmBillingReceipt)
    await db.delete(speechBillingReceipt)
    await db.delete(userFlux)
    await db.insert(userFlux).values({ userId: 'wallet', flux: 10 })
    await db.insert(schema.configKV).values({ key: 'FLUX_PER_1K_CHARS_TTS', value: '1' }).onConflictDoUpdate({ target: schema.configKV.key, set: { value: '1' } })
    const redis = createTestRedis()
    const config = createConfigKVService(createConfigKVStore(db, redis))
    billing = createBillingService(db, redis)
    llmBilling = createLlmBillingService(db, billing)
    speech = new SpeechBilling(db, billing, config)
  })

  it('combines LLM and speech fees and retains service-specific cost evidence', async () => {
    const first = await llmBilling.settleLlmCost(llm('llm', 0.0006))
    expect(first).toMatchObject({ costMicroFlux: 600_000, charged: 0, unsettledMicroFlux: 600_000 })
    await speech.assertCanAfford('wallet', 550, 10, { requestId: 'tts', model: 'tts-model' })
    const second = await speech.accumulate({ userId: 'wallet', requestId: 'tts', units: 550, currentBalance: 10, metadata: { model: 'tts-model' } })
    expect(second).toMatchObject({ costMicroFlux: 550_000, fluxDebited: 1, unsettledMicroFlux: 150_000 })
    const fees = await db.select().from(fluxTransaction).where(eq(fluxTransaction.type, 'accrual'))
    expect(fees).toHaveLength(2)
    expect(fees.find(fee => fee.sourceType === 'llm')?.amountMicroFlux).toBe(600_000)
    expect(fees.find(fee => fee.sourceType === 'tts')?.amountMicroFlux).toBe(550_000)
    expect((await db.select().from(fluxTransaction).where(eq(fluxTransaction.type, 'debit')))[0]).toMatchObject({ amount: 1, description: 'usage_settlement' })
  })

  it('never accumulates a replay that produced no integer debit', async () => {
    await speech.beginSpeechUsage({ userId: 'wallet', requestId: 'dust', model: 'tts', pricing: speechPricing })
    const input = { userId: 'wallet', requestId: 'dust', units: 100, model: 'tts' }
    await speech.settleSpeechUsage(input)
    const replay = await speech.settleSpeechUsage(input)
    expect(replay).toMatchObject({ replay: true, costMicroFlux: 100_000, charged: 0, unsettledMicroFlux: 100_000 })
    expect(await db.select().from(fluxTransaction).where(eq(fluxTransaction.type, 'debit'))).toHaveLength(0)
    expect(await db.select().from(fluxTransaction).where(eq(fluxTransaction.type, 'accrual'))).toHaveLength(1)
    await expect(speech.settleSpeechUsage({ ...input, units: 200 })).rejects.toThrow('Speech')
    await expect(speech.settleSpeechUsage({ ...input, model: 'different' })).rejects.toThrow('Speech')
    await expect(speech.settleSpeechUsage({ ...input, provider: 'different' })).rejects.toThrow('Speech')
  })

  it('rejects conflicting confirmed LLM fees without changing the pool', async () => {
    await llmBilling.settleLlmCost(llm('immutable', 0.0006))
    await expect(llmBilling.settleLlmCost(llm('immutable', 0.0007))).rejects.toThrow('LLM replay')
    expect(await billing.getWallet('wallet')).toMatchObject({ flux: 10, unsettledMicroFlux: 600_000 })
  })

  it('keeps pending LLM fees out of the pool and preserves the speech price across configuration changes', async () => {
    await llmBilling.settleLlmCost(llm('missing', undefined))
    await speech.assertCanAfford('wallet', 100, 10, { requestId: 'priced', model: 'tts' })
    await db.update(schema.configKV).set({ value: '100' }).where(eq(schema.configKV.key, 'FLUX_PER_1K_CHARS_TTS'))
    await speech.settleSpeechUsage({ userId: 'wallet', requestId: 'priced', units: 100, model: 'tts' })
    const wallet = await billing.getWallet('wallet')
    expect(wallet.unsettledMicroFlux).toBe(100_000)
    expect((await db.select().from(llmBillingReceipt).where(eq(llmBillingReceipt.requestId, 'missing')))[0].costMicroFlux).toBeNull()
  })

  it('retains unpaid fees and clears their affordable whole portion on credit without repeating the credit', async () => {
    await db.update(userFlux).set({ flux: 1 }).where(eq(userFlux.userId, 'wallet'))
    await llmBilling.settleLlmCost(llm('large', 0.0032))
    expect(await billing.getWallet('wallet')).toMatchObject({ flux: 0, unsettledMicroFlux: 2_200_000 })
    const credit = { userId: 'wallet', amount: 3, requestId: 'topup', description: 'Top up', source: 'payment' }
    const first = await billing.creditFlux(credit)
    expect(first.balanceAfter).toBe(1)
    const replay = await billing.creditFlux(credit)
    expect(replay).toMatchObject({ idempotent: true, balanceAfter: 1 })
    expect(await billing.getWallet('wallet')).toMatchObject({ flux: 1, unsettledMicroFlux: 200_000 })
    expect(await db.select().from(fluxTransaction)).toHaveLength(4)
  })

  it('ignores a stale caller balance for admission and includes both service debts', async () => {
    await db.update(userFlux).set({ flux: 1, unsettledMicroFlux: 900_000 }).where(eq(userFlux.userId, 'wallet'))
    await expect(speech.assertCanAfford('wallet', 101, 100, { requestId: 'blocked', model: 'tts' })).rejects.toThrow('Insufficient flux')
    expect(await db.select().from(speechBillingReceipt)).toHaveLength(0)
  })

  it('keeps usage identities separate by service while serializing one wallet', async () => {
    await speech.beginSpeechUsage({ userId: 'wallet', requestId: 'shared-id', model: 'tts', pricing: speechPricing })
    await Promise.all([
      llmBilling.settleLlmCost(llm('shared-id', 0.0006)),
      speech.settleSpeechUsage({ userId: 'wallet', requestId: 'shared-id', units: 550, model: 'tts' }),
      llmBilling.settleLlmCost(llm('shared-id', 0.0006)),
    ])
    expect(await billing.getWallet('wallet')).toMatchObject({ flux: 9, unsettledMicroFlux: 150_000 })
    expect(await db.select().from(fluxTransaction).where(eq(fluxTransaction.type, 'accrual'))).toHaveLength(2)
    expect(await db.select().from(fluxTransaction).where(eq(fluxTransaction.type, 'debit'))).toHaveLength(1)
  })

  it('preserves accrued fees on an admin balance change and rejects deleted wallets', async () => {
    await llmBilling.settleLlmCost(llm('dust', 0.0002))
    await billing.setFlux({ userId: 'wallet', balance: 0, description: 'Reset balance', issuedByUserId: 'admin' })
    expect(await billing.getWallet('wallet')).toMatchObject({ flux: 0, unsettledMicroFlux: 200_000 })
    await db.update(userFlux).set({ deletedAt: new Date() }).where(eq(userFlux.userId, 'wallet'))
    await expect(llmBilling.settleLlmCost(llm('deleted', 0.001))).rejects.toThrow('No active flux record')
  })
  it('posts a new source without models, pricing, receipts, or execution IDs', async () => {
    const input = { userId: 'wallet', source: { type: 'storage', id: 'file-1' }, amountMicroFlux: 400_000 }
    expect(await billing.postFluxUsage(input)).toMatchObject({ amountMicroFlux: 400_000, charged: 0, replay: false })
    expect(await billing.postFluxUsage(input)).toMatchObject({ replay: true, unsettledMicroFlux: 400_000 })
    await expect(billing.postFluxUsage({ ...input, amountMicroFlux: 500_000 })).rejects.toThrow('Flux source replay')
    expect(await db.select().from(llmBillingReceipt)).toHaveLength(0)
    expect(await db.select().from(speechBillingReceipt)).toHaveLength(0)
    expect(await db.select().from(fluxTransaction)).toHaveLength(1)
  })

  it('replays the wallet command after deleting all service evidence', async () => {
    await llmBilling.settleLlmCost(llm('independent', 0.0006))
    await db.delete(llmBillingReceipt)
    await db.delete(speechBillingReceipt)
    const result = await billing.postFluxUsage({ userId: 'wallet', source: { type: 'llm', id: 'independent' }, amountMicroFlux: 600_000 })
    expect(result).toMatchObject({ replay: true, charged: 0, unsettledMicroFlux: 600_000 })
    expect(await db.select().from(fluxTransaction)).toHaveLength(1)
  })

  it('persists zero accruals and rejects conflicting replay', async () => {
    const input = { userId: 'wallet', source: { type: 'free', id: 'event' }, amountMicroFlux: 0 }
    await billing.postFluxUsage(input)
    expect(await billing.postFluxUsage(input)).toMatchObject({ replay: true, charged: 0 })
    await expect(billing.postFluxUsage({ ...input, amountMicroFlux: 1 })).rejects.toThrow('Flux source replay')
    expect(await db.select().from(fluxTransaction)).toHaveLength(1)
  })

  it('imports a frozen debt source once', async () => {
    const input = { userId: 'wallet', source: { type: 'tts_debt_import', id: 'batch:wallet' }, amountMicroFlux: 1_550_000 }
    await billing.postFluxUsage(input)
    await billing.postFluxUsage(input)
    expect(await billing.getWallet('wallet')).toMatchObject({ flux: 9, unsettledMicroFlux: 550_000 })
    expect(await db.select().from(fluxTransaction)).toHaveLength(2)
  })
})
