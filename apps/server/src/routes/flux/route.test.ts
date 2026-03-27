import type { FluxService } from '../../services/flux'
import type { FluxAuditService } from '../../services/flux-audit'
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

function createMockFluxAuditService(): FluxAuditService {
  return {
    createEntry: vi.fn(),
    createEntries: vi.fn(),
    getHistory: vi.fn(async (_userId: string, limit: number, offset: number) => ({
      records: [
        {
          id: 'ledger-1',
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

function createTestApp(fluxService: FluxService, fluxAuditService: FluxAuditService) {
  const routes = createFluxRoutes(fluxService, fluxAuditService)
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
    const app = createTestApp(fluxService, createMockFluxAuditService())

    const res = await app.fetch(
      new Request('http://localhost/api/v1/flux'),
      { user: testUser } as any,
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ userId: 'user-1', flux: 42 })
    expect(fluxService.getFlux).toHaveBeenCalledWith('user-1')
  })

  it('get /api/v1/flux/history should clamp pagination query values', async () => {
    const fluxAuditService = createMockFluxAuditService()
    const app = createTestApp(createMockFluxService(), fluxAuditService)

    const res = await app.fetch(
      new Request('http://localhost/api/v1/flux/history?limit=999&offset=-12'),
      { user: testUser } as any,
    )

    expect(res.status).toBe(200)
    expect(fluxAuditService.getHistory).toHaveBeenCalledWith('user-1', 100, 0)
    expect(await res.json()).toEqual({
      records: [
        {
          id: 'ledger-1',
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
