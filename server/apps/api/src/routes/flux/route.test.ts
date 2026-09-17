import type { FluxService } from '../../services/domain/flux'
import type { FluxTransactionService } from '../../services/domain/flux-transaction'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import { createFluxRoutes } from '.'
import { ApiError } from '../../utils/error'

function createMockFluxService(): FluxService {
  return {
    getFlux: vi.fn(async (userId: string) => ({ userId, flux: 42 })),
  } as any
}

function createMockFluxTransactionService(): FluxTransactionService {
  return {
    log: vi.fn(),
    logBatch: vi.fn(),
    getStats: vi.fn(async () => ({ capacity: 0 })),
    getHistory: vi.fn(async (_userId: string, limit: number, offset: number) => ({
      records: [{ id: 'legacy-tx-1' }],
      hasMore: limit === 100 && offset === 0,
    })),
  } as any
}

function createTestApp(fluxService: FluxService, fluxTransactionService: FluxTransactionService) {
  const routes = createFluxRoutes(fluxService, fluxTransactionService)
  const app = new Hono<HonoEnv>()

  app.onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json({
        error: err.errorCode,
        message: err.message,
        details: err.details,
      }, err.statusCode)
    }

    return c.json({ error: 'Internal Server Error', message: err.message }, 500)
  })

  app.use('*', async (c, next) => {
    const user = (c.env as any)?.user
    if (user) {
      c.set('user', user)
    }
    await next()
  })

  app.route('/api/v1/flux', routes)
  return app
}

const testUser = { id: 'user-1', name: 'Test User', email: 'test@example.com' }

describe('fluxRoutes', () => {
  it('get /api/v1/flux should return the current user balance', async () => {
    const fluxService = createMockFluxService()
    const app = createTestApp(fluxService, createMockFluxTransactionService())

    const res = await app.fetch(
      new Request('http://localhost/api/v1/flux'),
      { user: testUser } as any,
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ userId: 'user-1', flux: 42 })
    expect(fluxService.getFlux).toHaveBeenCalledWith('user-1')
  })

  // https://github.com/moeru-ai/airi/pull/2491#discussion_r4035018237
  it('keeps the existing history response for released clients', async () => {
    // ROOT CAUSE:
    //
    // The grouped response replaced records with rows at the existing route.
    // Released clients then read data.records.length from an undefined value.
    const fluxTransactionService = createMockFluxTransactionService()
    const app = createTestApp(createMockFluxService(), fluxTransactionService)

    const res = await app.fetch(
      new Request('http://localhost/api/v1/flux/history?limit=999&offset=-12'),
      { user: testUser } as any,
    )

    expect(res.status).toBe(200)
    expect(fluxTransactionService.getHistory).toHaveBeenCalledWith('user-1', 100, 0)
    expect(await res.json()).toEqual({
      records: [{ id: 'legacy-tx-1' }],
      hasMore: true,
    })
  })
})
