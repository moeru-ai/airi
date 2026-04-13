import type { FluxService } from '../../services/flux'
import type { FluxTransactionService } from '../../services/flux-transaction'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import { createFluxRoutes } from '.'
import { ApiError } from '../../utils/error'

function createMockFluxService(): FluxService {
  return {
    getFlux: vi.fn(async (userId: string) => ({ userId, flux: 42 })),
    updateStripeCustomerId: vi.fn(),
  } as any
}

function createMockFluxTransactionService(): FluxTransactionService {
  return {
    createEntry: vi.fn(),
    createEntries: vi.fn(),
    getHistory: vi.fn(async (_userId: string, limit: number, offset: number) => ({
      records: [
        {
          id: 'tx-1',
          type: 'credit',
          amount: 5,
          description: 'Top up',
          metadata: { source: 'test' },
          createdAt: new Date('2026-03-27T10:00:00.000Z'),
        },
      ],
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

  it('get /api/v1/flux/history should clamp pagination query values', async () => {
    const fluxTransactionService = createMockFluxTransactionService()
    const app = createTestApp(createMockFluxService(), fluxTransactionService)

    const res = await app.fetch(
      new Request('http://localhost/api/v1/flux/history?limit=999&offset=-12'),
      { user: testUser } as any,
    )

    expect(res.status).toBe(200)
    expect(fluxTransactionService.getHistory).toHaveBeenCalledWith('user-1', 100, 0)
    expect(await res.json()).toEqual({
      records: [
        {
          id: 'tx-1',
          type: 'credit',
          amount: 5,
          description: 'Top up',
          metadata: { source: 'test' },
          createdAt: '2026-03-27T10:00:00.000Z',
        },
      ],
      hasMore: true,
    })
  })
})
