import type { Database } from '../../libs/db'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { createLlmRequestRoutes } from '../../routes/llm-requests'
import { userFlux } from '../../schemas/flux'
import { llmRequestAttempt } from '../../schemas/llm-request-attempt'
import { llmRequestLog } from '../../schemas/llm-request-log'
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
  beforeAll(async () => {
    db = await mockDB({ userFlux, llmRequestLog, llmRequestAttempt })
  })
  beforeEach(async () => {
    await db.delete(llmRequestAttempt)
    await db.delete(llmRequestLog)
    await db.delete(userFlux)
    await db.insert(userFlux).values({ userId: observation.userId, flux: 100 })
  })

  it('keeps rows without request IDs append-only and accepts new gateway usage fields', async () => {
    const logs = createRequestLogService(db)
    await logs.logRequest({ ...observation, requestId: undefined })
    await logs.logRequest({ ...observation, requestId: undefined })
    const entries = await db.select().from(llmRequestLog)
    expect(entries).toHaveLength(2)
    expect(entries[0].providerUsage).toEqual(observation.providerUsage)
  })

  it('records each dispatch, isolates users, and finishes only the selected attempt', async () => {
    const logs = createRequestLogService(db)
    await logs.beginRequest(observation)
    const attempts = logs.observeAttempts(observation.userId, observation.requestId)
    const first = await attempts.start({ gateway: 'first', model: 'first-model', credentialId: 'key-1' })
    await attempts.finish(first, { state: 'failed', status: 429, errorCode: 'upstream_http' })
    const second = await attempts.start({ gateway: 'second', model: 'second-model', credentialId: 'key-2' })
    await attempts.finish(second, { state: 'headers_received', status: 200 })
    await logs.logRequest({ ...observation, attemptId: second })
    const detail = await logs.getRequest(observation.userId, observation.requestId)
    expect(detail.request?.state).toBe('completed')
    expect(detail.attempts.map(attempt => [attempt.sequence, attempt.state])).toEqual([[1, 'failed'], [2, 'completed']])
    expect(await logs.getRequest('other-user', observation.requestId)).toEqual({ request: undefined, attempts: [] })
  })

  it.each([302, 499, 502])('keeps upstream header status when final request status is %s', async (status) => {
    const logs = createRequestLogService(db)
    await logs.beginRequest(observation)
    const attempts = logs.observeAttempts(observation.userId, observation.requestId)
    const attemptId = await attempts.start({ gateway: 'gateway', model: 'model', credentialId: 'key' })
    await attempts.finish(attemptId, { state: 'headers_received', status: 200 })
    await logs.logRequest({ ...observation, attemptId, status })
    const detail = await logs.getRequest(observation.userId, observation.requestId)
    expect(detail.request?.status).toBe(status)
    expect(detail.attempts[0]).toMatchObject({ status: 200, state: status === 499 ? 'cancelled' : 'failed' })
  })

  it('marks stale calls unknown without inventing cost or end times', async () => {
    const logs = createRequestLogService(db)
    await logs.beginRequest(observation)
    await logs.observeAttempts(observation.userId, observation.requestId).start({ gateway: 'gateway', model: 'model', credentialId: 'key' })
    await logs.recoverStaleRequests(new Date(Date.now() + 1000))
    const detail = await logs.getRequest(observation.userId, observation.requestId)
    expect(detail.request?.state).toBe('unknown')
    expect(detail.attempts[0].state).toBe('unknown')
    expect(detail.attempts[0].endedAt).toBeNull()
  })

  it('records and sanitizes diagnostics without creating billing records', async () => {
    const logs = createRequestLogService(db)
    await logs.beginRequest(observation)
    await logs.logRequest({ ...observation, providerUsage: { cost: 0.002, custom: { units: 4, api_key: 'private' }, messages: ['private'] } })
    expect((await logs.getRequest(observation.userId, observation.requestId)).request?.providerUsage).toEqual({ cost: 0.002, custom: { units: 4 } })
    await logs.logRequest({ ...observation, providerUsage: { oversized: 'x'.repeat(17_000) } })
    expect((await logs.getRequest(observation.userId, observation.requestId)).request?.providerUsage).toEqual({ capture: 'omitted', reason: 'size_limit', version: 1 })
    expect((await db.select().from(userFlux))[0].flux).toBe(100)
  })

  it('exposes only owner-scoped, safe request details through HTTP', async () => {
    const logs = createRequestLogService(db)
    await logs.beginRequest(observation)
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
    expect((await app.request(`/${'x'.repeat(129)}`)).status).toBe(400)
    await db.insert(llmRequestLog).values({ ...observation, userId: 'other', requestId: 'private-request' })
    expect((await app.request('/private-request')).status).toBe(404)
    const listing = await app.request('/?limit=1')
    expect(await listing.json()).toMatchObject({ records: [{ requestId: observation.requestId }], hasMore: false })
  })
})
