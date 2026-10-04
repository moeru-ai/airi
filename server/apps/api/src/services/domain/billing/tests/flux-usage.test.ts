import type { Database } from '../../../../libs/db'

import { eq, sum } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { mockDB } from '../../../../libs/mock-db'
import { createTestRedis } from '../../../../libs/tests/redis'
import { fluxTransaction, fluxUsage, userFlux } from '../../../../schemas'
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
  let config: ReturnType<typeof createConfigKVService>
  const pricing = { fluxPerUsd: 1000, multiplier: 1 }
  const llm = (requestId: string, costUsd: number | undefined) => ({
    userId: 'wallet',
    requestId,
    provider: 'gateway',
    model: 'llm-model',
    pricing,
    usage: { source: 'provider_reported' as const, costUsd, generationId: requestId },
  })
  const tts = (requestId: string, units: number) => ({ userId: 'wallet', requestId, units, model: 'tts-model' })

  beforeAll(async () => {
    db = await mockDB(schema)
  })
  beforeEach(async () => {
    await db.delete(fluxTransaction)
    await db.delete(fluxUsage)
    await db.delete(userFlux)
    await db.insert(userFlux).values({ userId: 'wallet', flux: 10 })
    await db.insert(schema.configKV).values({ key: 'FLUX_PER_1K_CHARS_TTS', value: '1' }).onConflictDoUpdate({ target: schema.configKV.key, set: { value: '1' } })
    const redis = createTestRedis()
    config = createConfigKVService(createConfigKVStore(db, redis))
    billing = createBillingService(db, redis)
    llmBilling = createLlmBillingService(billing)
    speech = new SpeechBilling(billing, config)
  })

  it('combines LLM and speech fees into one pool', async () => {
    const first = await llmBilling.settleLlmCost(llm('llm', 0.0006))
    expect(first).toMatchObject({ costMicroFlux: 600_000, charged: 0, unsettledMicroFlux: 600_000 })
    await speech.assertCanAfford('wallet', 550)
    const second = await speech.settle(tts('tts', 550))
    expect(second).toMatchObject({ costMicroFlux: 550_000, charged: 1, unsettledMicroFlux: 150_000 })
    const fees = await db.select().from(fluxUsage)
    expect(fees).toHaveLength(2)
    expect(fees.find(fee => fee.sourceType === 'llm')?.amountMicroFlux).toBe(600_000)
    expect(fees.find(fee => fee.sourceType === 'tts')).toMatchObject({ amountMicroFlux: 550_000, detail: { units: 550, model: 'tts-model', pricing: { fluxPer1kChars: 1 } } })
    expect(await db.select().from(fluxTransaction)).toEqual([expect.objectContaining({ type: 'debit', amount: 1, description: 'usage_settlement' })])
  })

  it('never accumulates a replay that produced no integer debit', async () => {
    await speech.settle(tts('dust', 100))
    const replay = await speech.settle(tts('dust', 100))
    expect(replay).toMatchObject({ replay: true, costMicroFlux: 100_000, charged: 0, unsettledMicroFlux: 100_000 })
    expect(await db.select().from(fluxTransaction)).toHaveLength(0)
    expect(await db.select().from(fluxUsage)).toHaveLength(1)
    await expect(speech.settle(tts('dust', 200))).rejects.toThrow('Flux source replay')
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
    expect(await db.select().from(fluxTransaction)).toHaveLength(3)
  })

  it('ignores cached balances for admission and includes outstanding fees', async () => {
    await db.update(userFlux).set({ flux: 1, unsettledMicroFlux: 900_000 }).where(eq(userFlux.userId, 'wallet'))
    await expect(speech.assertCanAfford('wallet', 101)).rejects.toThrow('Insufficient flux')
    await speech.assertCanAfford('wallet', 100)
  })

  it('keeps usage identities separate by service while serializing one wallet', async () => {
    await Promise.all([
      llmBilling.settleLlmCost(llm('shared-id', 0.0006)),
      speech.settle(tts('shared-id', 550)),
      llmBilling.settleLlmCost(llm('shared-id', 0.0006)),
    ])
    expect(await billing.getWallet('wallet')).toMatchObject({ flux: 9, unsettledMicroFlux: 150_000 })
    expect(await db.select().from(fluxUsage)).toHaveLength(2)
    expect(await db.select().from(fluxTransaction)).toHaveLength(1)
  })

  it('preserves outstanding fees on an admin balance change and rejects deleted wallets', async () => {
    await llmBilling.settleLlmCost(llm('dust', 0.0002))
    await billing.setFlux({ userId: 'wallet', balance: 0, description: 'Reset balance', issuedByUserId: 'admin' })
    expect(await billing.getWallet('wallet')).toMatchObject({ flux: 0, unsettledMicroFlux: 200_000 })
    await db.update(userFlux).set({ deletedAt: new Date() }).where(eq(userFlux.userId, 'wallet'))
    await expect(llmBilling.settleLlmCost(llm('deleted', 0.001))).rejects.toThrow('No active flux record')
  })

  it('posts a new source with only a user, a source, and an amount', async () => {
    const input = { userId: 'wallet', source: { type: 'storage', id: 'file-1' }, amountMicroFlux: 400_000 }
    expect(await billing.postFluxUsage(input)).toMatchObject({ amountMicroFlux: 400_000, charged: 0, replay: false })
    expect(await billing.postFluxUsage(input)).toMatchObject({ replay: true, unsettledMicroFlux: 400_000 })
    await expect(billing.postFluxUsage({ ...input, amountMicroFlux: 500_000 })).rejects.toThrow('Flux source replay')
    expect(await db.select().from(fluxUsage)).toHaveLength(1)
    expect(await db.select().from(fluxTransaction)).toHaveLength(0)
  })

  it('persists zero fees and rejects conflicting replay', async () => {
    const input = { userId: 'wallet', source: { type: 'free', id: 'event' }, amountMicroFlux: 0 }
    await billing.postFluxUsage(input)
    expect(await billing.postFluxUsage(input)).toMatchObject({ replay: true, charged: 0 })
    await expect(billing.postFluxUsage({ ...input, amountMicroFlux: 1 })).rejects.toThrow('Flux source replay')
    expect(await db.select().from(fluxUsage)).toHaveLength(1)
  })

  it('spends plan Credits before the wallet and skips Flux when the plan covers speech', async () => {
    await db.update(userFlux).set({ flux: 0 }).where(eq(userFlux.userId, 'wallet'))
    const debitCredits = vi.fn(async (input: { amountMicro: number }) => ({ chargedMicro: input.amountMicro, requestedMicro: input.amountMicro }))
    const subscriptions = {
      getStatus: async () => ({ allowances: [{ remainingMicro: 5_000_000 }] }),
      getFallbackPreference: async () => false,
      debitCredits,
    }
    const planSpeech = new SpeechBilling(billing, config, null, subscriptions)
    await planSpeech.assertCanAfford('wallet', 1000)
    await planSpeech.settle(tts('plan-tts', 1000))
    expect(debitCredits).toHaveBeenCalledWith(expect.objectContaining({ amountMicro: 1_000_000 }))
    expect(await db.select().from(fluxUsage)).toHaveLength(0)
  })

  it('rejects speech when plan Credits are short and Flux fallback is off', async () => {
    const subscriptions = {
      getStatus: async () => ({ allowances: [] }),
      getFallbackPreference: async () => false,
      debitCredits: vi.fn(),
    }
    const planSpeech = new SpeechBilling(billing, config, null, subscriptions)
    await expect(planSpeech.assertCanAfford('wallet', 1000)).rejects.toThrow('Insufficient flux')
  })

  it('posts speech to the wallet when plan Credits are short and Flux fallback is on', async () => {
    const subscriptions = {
      getStatus: async () => ({ allowances: [] }),
      getFallbackPreference: async () => true,
      debitCredits: vi.fn(),
    }
    const planSpeech = new SpeechBilling(billing, config, null, subscriptions)
    await planSpeech.settle(tts('fallback-tts', 1000))
    expect(await db.select().from(fluxUsage)).toHaveLength(1)
  })

  it('conserves fees: usage total equals debited Flux plus the outstanding pool', async () => {
    await billing.postFluxUsage({ userId: 'wallet', source: { type: 'a', id: '1' }, amountMicroFlux: 1_550_000 })
    await billing.postFluxUsage({ userId: 'wallet', source: { type: 'a', id: '2' }, amountMicroFlux: 700_000 })
    const wallet = await billing.getWallet('wallet')
    const [{ total }] = await db.select({ total: sum(fluxUsage.amountMicroFlux) }).from(fluxUsage)
    expect(Number(total)).toBe((10 - wallet.flux) * 1_000_000 + wallet.unsettledMicroFlux)
  })
})
