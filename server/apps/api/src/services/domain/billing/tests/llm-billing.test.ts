import type { Database } from '../../../../libs/db'

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
const input = (requestId: string, costUsd: number | undefined) => ({ userId: 'wallet', requestId, model: 'model', provider: 'gateway', pricing, usage: { source: 'provider_reported' as const, generationId: requestId, costUsd } })

beforeAll(async () => {
  db = await mockDB(schema)
})
beforeEach(async () => {
  await db.delete(schema.fluxTransaction)
  await db.delete(schema.fluxUsage)
  await db.delete(schema.userFlux)
  await db.insert(schema.userFlux).values({ userId: 'wallet', flux: 10 })
  billing = createBillingService(db, createTestRedis())
  llm = createLlmBillingService(billing)
})

it('posts nothing for an unknown cost or an explicit pending reason', async () => {
  expect(await llm.settleLlmCost(input('missing', undefined))).toMatchObject({ pending: true, charged: 0 })
  expect(await llm.settleLlmCost({ ...input('stream', 0.0006), pendingReason: 'stream_interrupted' })).toMatchObject({ pending: true })
  expect(await db.select().from(schema.fluxUsage)).toHaveLength(0)
  expect(await db.select().from(schema.fluxTransaction)).toHaveLength(0)
  expect(await billing.getWallet('wallet')).toMatchObject({ flux: 10, unsettledMicroFlux: 0 })
})

it('posts a confirmed cost once with the price snapshot as usage detail', async () => {
  const first = await llm.settleLlmCost(input('receipt', 0.0006))
  expect(first).toMatchObject({ pending: false, costMicroFlux: 600_000, charged: 0, replay: false })
  expect(await llm.settleLlmCost(input('receipt', 0.0006))).toMatchObject({ replay: true, charged: 0 })
  const [usage] = await db.select().from(schema.fluxUsage)
  expect(usage).toMatchObject({ sourceType: 'llm', sourceId: 'receipt', amountMicroFlux: 600_000, detail: { provider: 'gateway', model: 'model', generationId: 'receipt', costSource: 'provider_reported', costUsd: 0.0006, pricing } })
  expect(await billing.getWallet('wallet')).toMatchObject({ flux: 10, unsettledMicroFlux: 600_000 })
})

it('rejects a conflicting fee for a confirmed request without changing the pool', async () => {
  await llm.settleLlmCost(input('immutable', 0.0006))
  await expect(llm.settleLlmCost(input('immutable', 0.0007))).rejects.toThrow('Flux source replay')
  expect(await billing.getWallet('wallet')).toMatchObject({ flux: 10, unsettledMicroFlux: 600_000 })
})

it('rolls back the usage record and wallet state when posting fails', async () => {
  await db.update(schema.userFlux).set({ unsettledMicroFlux: Number.MAX_SAFE_INTEGER })
  await expect(llm.settleLlmCost(input('overflow', 0.001))).rejects.toThrow()
  expect(await db.select().from(schema.fluxUsage)).toHaveLength(0)
  expect(await db.select().from(schema.fluxTransaction)).toHaveLength(0)
  expect(await billing.getWallet('wallet')).toMatchObject({ flux: 10, unsettledMicroFlux: Number.MAX_SAFE_INTEGER })
})
