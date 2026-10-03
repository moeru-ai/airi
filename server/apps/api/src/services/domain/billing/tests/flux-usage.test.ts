import type { Database } from '../../../../libs/db'

import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { mockDB } from '../../../../libs/mock-db'
import { createTestRedis } from '../../../../libs/tests/redis'
import { fluxTransaction, fluxUsage, userFlux } from '../../../../schemas'
import { createConfigKVService } from '../../../adapters/config-kv'
import { createConfigKVStore } from '../../../adapters/config-kv/store'
import { createBillingService } from '../billing-service'
import { SpeechBilling } from '../speech-billing'

import * as schema from '../../../../schemas'

describe('shared Flux usage', () => {
  let db: Database
  let billing: ReturnType<typeof createBillingService>
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
    await db.delete(fluxUsage)
    await db.delete(userFlux)
    await db.insert(userFlux).values({ userId: 'wallet', flux: 10 })
    await db.insert(schema.configKV).values({ key: 'FLUX_PER_1K_CHARS_TTS', value: '1' }).onConflictDoUpdate({ target: schema.configKV.key, set: { value: '1' } })
    const redis = createTestRedis()
    const config = createConfigKVService(createConfigKVStore(db, redis))
    billing = createBillingService(db, redis, config)
    speech = new SpeechBilling(billing, config)
  })

  it('combines LLM and speech fees and retains service-specific cost evidence', async () => {
    const first = await billing.settleLlmCost(llm('llm', 0.0006))
    expect(first).toMatchObject({ costMicroFlux: 600_000, charged: 0, unsettledMicroFlux: 600_000 })
    await speech.assertCanAfford('wallet', 550, 10, { requestId: 'tts', model: 'tts-model' })
    const second = await speech.accumulate({ userId: 'wallet', requestId: 'tts', units: 550, currentBalance: 10, metadata: { model: 'tts-model' } })
    expect(second).toMatchObject({ costMicroFlux: 550_000, fluxDebited: 1, unsettledMicroFlux: 150_000 })
    const fees = await db.select().from(fluxUsage)
    expect(fees).toHaveLength(2)
    expect(fees.find(fee => fee.service === 'llm')?.costMicroFlux).toBe(600_000)
    expect(fees.find(fee => fee.service === 'tts')?.costMicroFlux).toBe(550_000)
    expect((await db.select().from(fluxTransaction))[0]).toMatchObject({ amount: 1, description: 'usage_settlement' })
  })

  it('never accumulates a replay that produced no integer debit', async () => {
    await billing.beginSpeechUsage({ userId: 'wallet', requestId: 'dust', model: 'tts', pricing: speechPricing })
    const input = { userId: 'wallet', requestId: 'dust', units: 100, model: 'tts' }
    await billing.settleSpeechUsage(input)
    const replay = await billing.settleSpeechUsage(input)
    expect(replay).toMatchObject({ replay: true, costMicroFlux: 100_000, charged: 0, unsettledMicroFlux: 100_000 })
    expect(await db.select().from(fluxTransaction)).toHaveLength(0)
    expect(await db.select().from(fluxUsage)).toHaveLength(1)
    await expect(billing.settleSpeechUsage({ ...input, units: 200 })).rejects.toThrow('Speech replay')
    await expect(billing.settleSpeechUsage({ ...input, model: 'different' })).rejects.toThrow('Speech replay')
    await expect(billing.settleSpeechUsage({ ...input, provider: 'different' })).rejects.toThrow('Speech replay')
  })

  it('rejects conflicting confirmed LLM fees without changing the pool', async () => {
    await billing.settleLlmCost(llm('immutable', 0.0006))
    await expect(billing.settleLlmCost(llm('immutable', 0.0007))).rejects.toThrow('LLM replay')
    expect(await billing.getWallet('wallet')).toMatchObject({ flux: 10, unsettledMicroFlux: 600_000 })
  })

  it('keeps pending LLM fees out of the pool and preserves the speech price across configuration changes', async () => {
    await billing.settleLlmCost(llm('missing', undefined))
    await speech.assertCanAfford('wallet', 100, 10, { requestId: 'priced', model: 'tts' })
    await db.update(schema.configKV).set({ value: '100' }).where(eq(schema.configKV.key, 'FLUX_PER_1K_CHARS_TTS'))
    await billing.settleSpeechUsage({ userId: 'wallet', requestId: 'priced', units: 100, model: 'tts' })
    const wallet = await billing.getWallet('wallet')
    expect(wallet.unsettledMicroFlux).toBe(100_000)
    expect((await db.select().from(fluxUsage).where(eq(fluxUsage.requestId, 'missing')))[0].costMicroFlux).toBeNull()
  })

  it('retains unpaid fees and clears their affordable whole portion on credit without repeating the credit', async () => {
    await db.update(userFlux).set({ flux: 1 }).where(eq(userFlux.userId, 'wallet'))
    await billing.settleLlmCost(llm('large', 0.0032))
    expect(await billing.getWallet('wallet')).toMatchObject({ flux: 0, unsettledMicroFlux: 2_200_000 })
    const credit = { userId: 'wallet', amount: 3, requestId: 'topup', description: 'Top up', source: 'payment' }
    const first = await billing.creditFlux(credit)
    expect(first.balanceAfter).toBe(1)
    const replay = await billing.creditFlux(credit)
    expect(replay).toMatchObject({ idempotent: true, balanceAfter: 1 })
    expect(await billing.getWallet('wallet')).toMatchObject({ flux: 1, unsettledMicroFlux: 200_000 })
    expect(await db.select().from(fluxTransaction)).toHaveLength(3)
  })

  it('ignores a stale caller balance for admission and includes both service debts', async () => {
    await db.update(userFlux).set({ flux: 1, unsettledMicroFlux: 900_000 }).where(eq(userFlux.userId, 'wallet'))
    await expect(speech.assertCanAfford('wallet', 101, 100, { requestId: 'blocked', model: 'tts' })).rejects.toThrow('Insufficient flux')
    expect(await db.select().from(fluxUsage)).toHaveLength(0)
  })

  it('keeps usage identities separate by service while serializing one wallet', async () => {
    await billing.beginSpeechUsage({ userId: 'wallet', requestId: 'shared-id', model: 'tts', pricing: speechPricing })
    await Promise.all([
      billing.settleLlmCost(llm('shared-id', 0.0006)),
      billing.settleSpeechUsage({ userId: 'wallet', requestId: 'shared-id', units: 550, model: 'tts' }),
      billing.settleLlmCost(llm('shared-id', 0.0006)),
    ])
    expect(await billing.getWallet('wallet')).toMatchObject({ flux: 9, unsettledMicroFlux: 150_000 })
    expect(await db.select().from(fluxUsage)).toHaveLength(2)
    expect(await db.select().from(fluxTransaction)).toHaveLength(1)
  })

  it('preserves accrued fees on an admin balance change and rejects deleted wallets', async () => {
    await billing.settleLlmCost(llm('dust', 0.0002))
    await billing.setFlux({ userId: 'wallet', balance: 0, description: 'Reset balance', issuedByUserId: 'admin' })
    expect(await billing.getWallet('wallet')).toMatchObject({ flux: 0, unsettledMicroFlux: 200_000 })
    await db.update(userFlux).set({ deletedAt: new Date() }).where(eq(userFlux.userId, 'wallet'))
    await expect(billing.settleLlmCost(llm('deleted', 0.001))).rejects.toThrow('No active flux record')
  })
  it('accepts a new metered service through the same fee contract and rejects conflicting replay', async () => {
    const input = {
      userId: 'wallet',
      service: 'asr',
      requestId: 'audio-1',
      model: 'transcription',
      method: 'duration',
      costSource: 'duration_price',
      costMicroFlux: 400_000,
      pricing: { seconds: 4, fluxPerSecond: 0.1 },
    }
    const first = await billing.recordUsage(input)
    expect(first).toMatchObject({ costMicroFlux: 400_000, charged: 0, replay: false })
    expect(await billing.recordUsage(input)).toMatchObject({ replay: true, unsettledMicroFlux: 400_000 })
    await expect(billing.recordUsage({ ...input, costMicroFlux: 500_000 })).rejects.toThrow('Usage replay')
    expect(await db.select().from(fluxTransaction)).toHaveLength(0)
  })

  it('imports frozen speech debt once and preserves its cutover price', async () => {
    const input = {
      userId: 'wallet',
      service: 'tts',
      requestId: 'redis-import:batch:wallet',
      model: 'redis_debt_import',
      method: 'redis_import',
      costSource: 'frozen_redis_counter',
      costMicroFlux: 1_550_000,
      pricing: { fluxPer1kChars: 1, characters: 1550, batchId: 'batch' },
    }
    await billing.recordUsage(input)
    await billing.recordUsage(input)
    expect(await billing.getWallet('wallet')).toMatchObject({ flux: 9, unsettledMicroFlux: 550_000 })
    expect(await db.select().from(fluxUsage)).toHaveLength(1)
    expect(await db.select().from(fluxTransaction)).toHaveLength(1)
  })
})
