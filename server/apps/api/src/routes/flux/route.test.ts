import type { BillingService } from '../../services/domain/billing/billing-service'
import type { FluxService } from '../../services/domain/flux'
import type { FluxTransactionService } from '../../services/domain/flux-transaction'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import { createFluxRoutes } from '.'
import { ApiError } from '../../utils/error'

function createMockFluxService(): FluxService {
  return {
    getFlux: vi.fn(async (userId: string) => ({ userId, flux: 42, unsettledMicroFlux: 150_000, fallbackToFlux: false, planRemainingPercent: 90 })),
    deleteAllForUser: vi.fn(async () => undefined),
  }
}

function createMockFluxTransactionService(): FluxTransactionService {
  return {
    log: vi.fn(async () => undefined),
    logBatch: vi.fn(async () => undefined),
    getStats: vi.fn(async () => ({ capacity: 100 })),
    getHistory: vi.fn(async (_userId: string, limit: number, offset: number) => ({
      records: [{ id: 'tx-1', type: 'credit', amount: 5, description: 'Top up', metadata: { source: 'test' }, createdAt: new Date('2026-03-27T10:00:00.000Z') }],
      hasMore: limit === 100 && offset === 0,
    })),
    getUsageHistory: vi.fn(async () => ({
      records: [{
        id: 'usage-1',
        sourceType: 'tts',
        sourceId: 'request-1',
        amountMicroFlux: 550_000,
        createdAt: new Date('2026-03-27T10:00:00.000Z'),
      }],
      hasMore: false,
    })),
  }
}

function createMockBillingService(): Pick<BillingService, 'setFallbackToFlux'> {
  return { setFallbackToFlux: vi.fn(async () => undefined) }
}

function createTestApp(
  fluxService: FluxService,
  transactions: FluxTransactionService,
  authenticated = true,
  billing: Pick<BillingService, 'setFallbackToFlux'> = createMockBillingService(),
) {
  const app = new Hono<HonoEnv>()
  app.onError((error, c) => {
    if (error instanceof ApiError)
      return c.json({ error: error.errorCode, message: error.message, details: error.details }, error.statusCode)
    return c.json({ error: 'Internal Server Error', message: error.message }, 500)
  })
  app.use('*', async (c, next) => {
    c.set('user', authenticated ? { id: 'user-1', name: 'Test User', email: 'test@example.com', emailVerified: true, createdAt: new Date(), updatedAt: new Date() } : null)
    await next()
  })
  app.route('/api/v1/flux', createFluxRoutes(fluxService, transactions, billing))
  return app
}

describe('fluxRoutes', () => {
  it('returns both buckets with the plan percent and the fallback choice', async () => {
    const flux = createMockFluxService()
    const app = createTestApp(flux, createMockFluxTransactionService())
    const response = await app.request('/api/v1/flux')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ userId: 'user-1', flux: 42, unsettledMicroFlux: 150_000, fallbackToFlux: false, planRemainingPercent: 90 })
    expect(flux.getFlux).toHaveBeenCalledWith('user-1')
  })

  it('clamps integer history pagination', async () => {
    const transactions = createMockFluxTransactionService()
    const app = createTestApp(createMockFluxService(), transactions)
    const response = await app.request('/api/v1/flux/history?limit=999&offset=-12')
    expect(response.status).toBe(200)
    expect(transactions.getHistory).toHaveBeenCalledWith('user-1', 100, 0)
    expect(await response.json()).toEqual({
      records: [{ id: 'tx-1', type: 'credit', amount: 5, description: 'Top up', metadata: { source: 'test' }, createdAt: '2026-03-27T10:00:00.000Z' }],
      hasMore: true,
    })
  })

  it('returns service fees separately and scopes the query to the authenticated wallet', async () => {
    const transactions = createMockFluxTransactionService()
    const app = createTestApp(createMockFluxService(), transactions)
    const response = await app.request('/api/v1/flux/usage?limit=20&offset=5')
    expect(response.status).toBe(200)
    expect(transactions.getUsageHistory).toHaveBeenCalledWith('user-1', 20, 5)
    expect(await response.json()).toMatchObject({
      records: [{ sourceType: 'tts', amountMicroFlux: 550_000, createdAt: '2026-03-27T10:00:00.000Z' }],
      hasMore: false,
    })
  })

  it('rejects unauthenticated fee history requests before reading the database', async () => {
    const transactions = createMockFluxTransactionService()
    const app = createTestApp(createMockFluxService(), transactions, false)
    const response = await app.request('/api/v1/flux/usage')
    expect(response.status).toBe(401)
    expect(transactions.getUsageHistory).not.toHaveBeenCalled()
  })

  it('saves the fallback choice for the authenticated wallet', async () => {
    const billing = createMockBillingService()
    const app = createTestApp(createMockFluxService(), createMockFluxTransactionService(), true, billing)
    const response = await app.request('/api/v1/flux/fallback', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fallbackToFlux: true }),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ fallbackToFlux: true })
    expect(billing.setFallbackToFlux).toHaveBeenCalledWith('user-1', true)
  })

  it('rejects an invalid fallback body', async () => {
    const billing = createMockBillingService()
    const app = createTestApp(createMockFluxService(), createMockFluxTransactionService(), true, billing)
    const response = await app.request('/api/v1/flux/fallback', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fallbackToFlux: 'yes' }),
    })
    expect(response.status).toBe(400)
    expect(billing.setFallbackToFlux).not.toHaveBeenCalled()
  })
})
