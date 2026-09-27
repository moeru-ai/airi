import type { Database } from '../../libs/db'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { createTestRedis } from '../../libs/tests/redis'
import { createLlmRequestRoutes } from '../../routes/llm-requests'
import { userFlux } from '../../schemas/flux'
import { fluxTransaction } from '../../schemas/flux-transaction'
import { llmRequestAttempt } from '../../schemas/llm-request-attempt'
import { llmRequestLog } from '../../schemas/llm-request-log'
import { llmRequestSettlement } from '../../schemas/llm-request-settlement'
import { createConfigKVService } from '../adapters/config-kv'
import { createConfigKVStore } from '../adapters/config-kv/store'
import { createBillingService } from './billing/billing-service'
import { createRequestLogService } from './request-log'

describe('request log and billing ownership', () => {
  let db: Database
  const observation = {
    userId: 'log-user',
    requestId: 'request-1',
    model: 'routed-model',
    requestedModel: 'chat-auto',
    gateway: 'openrouter.ai',
    upstreamProvider: 'Inference Provider',
    upstreamModel: 'sent-model',
    responseModel: 'returned-model',
    generationId: 'gen-1',
    status: 200,
    durationMs: 150,
    fluxConsumed: 0,
    protocol: 'chat-completions',
    stream: true,
    providerUsage: { cost: 0.002, vendor_meter: { units: 3 } },
  }
  const settlement = {
    userId: observation.userId,
    requestId: observation.requestId,
    model: observation.model,
    provider: 'openrouter',
    pricing: { fluxPerUsd: 1000, multiplier: 1.5 },
    usage: { generationId: observation.generationId, costUsd: 0.002, providerUsage: observation.providerUsage },
    observation,
  }

  beforeAll(async () => {
    db = await mockDB({ userFlux, fluxTransaction, llmRequestLog, llmRequestAttempt, llmRequestSettlement })
  })
  beforeEach(async () => {
    await db.delete(fluxTransaction)
    await db.delete(llmRequestSettlement)
    await db.delete(llmRequestAttempt)
    await db.delete(llmRequestLog)
    await db.delete(userFlux)
    await db.insert(userFlux).values({ userId: observation.userId, flux: 100 })
  })

  function billing() {
    const redis = createTestRedis()
    return createBillingService(db, redis, createConfigKVService(createConfigKVStore(db, redis)))
  }

  // ROOT CAUSE:
  // A delayed observation can arrive after billing commits. Independent settlement
  // evidence must survive diagnostic updates and retention.
  it('preserves settlement when a delayed observation reports zero or different cost', async () => {
    await billing().settleLlmCost(settlement)
    const delayed = {
      ...observation,
      durationMs: 200,
      providerUsage: { cost: 999 },
      generationId: 'wrong-id',
      billingStatus: 'pending',
      pricing: { multiplier: 99 },
    }
    await createRequestLogService(db).logRequest(delayed)
    const [entry] = await db.select().from(llmRequestSettlement)
    expect(entry).toMatchObject({
      billingStatus: 'settled',
      billingProvider: 'openrouter',
      fluxConsumed: 3,
      pricing: settlement.pricing,
      providerUsage: observation.providerUsage,
      generationId: 'gen-1',
    })
    expect(await db.select().from(fluxTransaction)).toHaveLength(1)
  })

  it('enriches the same row whether observation or settlement arrives first', async () => {
    await createRequestLogService(db).logRequest(observation)
    await billing().settleLlmCost(settlement)
    await createRequestLogService(db).logRequest({ ...observation, cachedTokens: 80, timeToFirstTokenMs: 40 })
    const entries = await db.select().from(llmRequestLog)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ fluxConsumed: 3, cachedTokens: 80, timeToFirstTokenMs: 40 })
  })

  it('upgrades an existing observation to pending and reconciles with the original price', async () => {
    const service = billing()
    await createRequestLogService(db).logRequest(observation)
    await service.settleLlmCost({ ...settlement, pendingReason: 'stream_interrupted' })
    await createRequestLogService(db).logRequest({ ...observation, status: 499 })
    expect((await db.select().from(llmRequestSettlement))[0]).toMatchObject({ billingStatus: 'pending' })
    expect(await db.select().from(fluxTransaction)).toHaveLength(0)
    await service.settleLlmCost({ ...settlement, pricing: { fluxPerUsd: 999, multiplier: 999 } })
    expect((await db.select().from(llmRequestSettlement))[0]).toMatchObject({ billingStatus: 'settled', fluxConsumed: 3, pricing: settlement.pricing })
    expect((await db.select().from(userFlux))[0].flux).toBe(97)
  })

  it('keeps rows without request IDs append-only and accepts new gateway usage fields', async () => {
    const logs = createRequestLogService(db)
    await logs.logRequest({ ...observation, requestId: undefined })
    await logs.logRequest({ ...observation, requestId: undefined })
    const entries = await db.select().from(llmRequestLog)
    expect(entries).toHaveLength(2)
    expect(entries[0].providerUsage).toEqual(observation.providerUsage)
    expect(await db.select().from(llmRequestSettlement)).toEqual([])
  })

  it('rejects a different generation ID on replay after settlement', async () => {
    const service = billing()
    await service.settleLlmCost(settlement)
    await expect(service.settleLlmCost({ ...settlement, usage: { ...settlement.usage, generationId: 'other' } }))
      .rejects
      .toThrow('Generation ID does not match')
    expect((await db.select().from(userFlux))[0].flux).toBe(97)
  })

  it('records each dispatch, isolates users, and finishes only the selected attempt', async () => {
    const logs = createRequestLogService(db)
    await logs.beginRequest(observation, { fallbackRate: 1 })
    const attempts = logs.observeAttempts(observation.userId, observation.requestId)
    const first = await attempts.start({ gateway: 'first', model: 'first-model', credentialId: 'key-1' })
    await attempts.finish(first, { state: 'failed', status: 429, errorCode: 'upstream_http' })
    const second = await attempts.start({ gateway: 'second', model: 'second-model', credentialId: 'key-2' })
    await attempts.finish(second, { state: 'headers_received', status: 200 })
    await logs.logRequest({ ...observation, attemptId: second })
    const detail = await logs.getRequest(observation.userId, observation.requestId)
    expect(detail.request?.state).toBe('completed')
    expect(detail.attempts.map(attempt => [attempt.sequence, attempt.state])).toEqual([[1, 'failed'], [2, 'completed']])
    expect(detail.settlement?.billingStatus).toBe('pending')
    expect(await logs.getRequest('other-user', observation.requestId)).toEqual({ request: undefined, attempts: [], settlement: undefined })
  })

  it('preserves billing evidence and replay after diagnostic retention', async () => {
    await billing().settleLlmCost(settlement)
    await db.delete(llmRequestLog)
    await db.delete(llmRequestAttempt)
    await billing().settleLlmCost(settlement)
    const [record] = await db.select().from(llmRequestSettlement)
    expect(record.costUsd).toBe('0.002')
    const transactions = await db.select().from(fluxTransaction)
    expect(transactions).toHaveLength(1)
    expect(transactions[0].settlementId).toBe(record.id)
    expect(transactions[0].operationId).toBe(`llm:${record.id}:initial`)
  })

  it('marks stale calls unknown without inventing cost or end times', async () => {
    const logs = createRequestLogService(db)
    await logs.beginRequest(observation, { fallbackRate: 1 })
    await logs.observeAttempts(observation.userId, observation.requestId).start({ gateway: 'gateway', model: 'model', credentialId: 'key' })
    await logs.recoverStaleRequests(new Date(Date.now() + 1000))
    const detail = await logs.getRequest(observation.userId, observation.requestId)
    expect(detail.request?.state).toBe('unknown')
    expect(detail.attempts[0].state).toBe('unknown')
    expect(detail.attempts[0].endedAt).toBeNull()
    expect(detail.settlement?.billingStatus).toBe('pending')
    expect(await db.select().from(fluxTransaction)).toEqual([])
  })

  it('uses the same settlement boundary for per-request pricing', async () => {
    const logs = createRequestLogService(db)
    await logs.beginRequest(observation, { fallbackRate: 2 })
    const input = { ...observation, amount: 2, settlement: { method: 'request' as const, pricing: { fallbackRate: 2 }, observation } }
    await billing().consumeFluxForLLM(input)
    await billing().consumeFluxForLLM(input)
    expect((await db.select().from(llmRequestSettlement))[0]).toMatchObject({ method: 'request', billingStatus: 'settled', fluxConsumed: 2 })
    expect((await db.select().from(userFlux))[0].flux).toBe(98)
    expect(await db.select().from(fluxTransaction)).toHaveLength(1)
  })

  it('pins authorization prices and retains unknown provider fields without credentials', async () => {
    const logs = createRequestLogService(db)
    await logs.beginRequest(observation, { fallbackRate: 1, costPricing: { openrouter: settlement.pricing } })
    await billing().settleLlmCost({ ...settlement, pricing: { fluxPerUsd: 999, multiplier: 999 }, usage: { ...settlement.usage, providerUsage: { cost: 0.002, custom: { units: 4, api_key: 'private' }, messages: ['private'] } } })
    const [entry] = await db.select().from(llmRequestSettlement)
    expect(entry.fluxConsumed).toBe(3)
    expect(entry.providerUsage).toEqual({ cost: 0.002, custom: { units: 4 } })
    expect(JSON.stringify(entry.evidence)).not.toContain('private')
    await logs.logRequest({ ...observation, providerUsage: { oversized: 'x'.repeat(17_000) } })
    expect((await logs.getRequest(observation.userId, observation.requestId)).request?.providerUsage).toEqual({ capture: 'omitted', reason: 'size_limit', version: 1 })
  })

  it('exposes only owner-scoped, safe request details through HTTP', async () => {
    const logs = createRequestLogService(db)
    await logs.beginRequest(observation, { fallbackRate: 1 })
    await logs.observeAttempts(observation.userId, observation.requestId).start({ gateway: 'gateway', credentialId: 'secret-key-reference', model: 'model' })
    const app = new Hono<HonoEnv>()
    app.use('*', async (context, next) => {
      context.set('user', { id: observation.userId, name: 'Test', email: 'test@example.com', emailVerified: true, createdAt: new Date(), updatedAt: new Date() })
      await next()
    })
    app.route('/', createLlmRequestRoutes(logs))
    const response = await app.request(`/${observation.requestId}`)
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(body).toContain('gateway')
    expect(body).not.toContain('secret-key-reference')
    expect(body).not.toContain('fallbackRate')
    expect((await app.request('/missing')).status).toBe(404)
    await db.insert(llmRequestLog).values({ ...observation, userId: 'other', requestId: 'private-request' })
    expect((await app.request('/private-request')).status).toBe(404)
    const listing = await app.request('/?limit=1')
    expect(await listing.json()).toMatchObject({ records: [{ requestId: observation.requestId }], hasMore: false })
  })
})
