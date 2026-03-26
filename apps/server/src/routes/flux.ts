import type { FluxService } from '../services/flux'
import type { FluxAuditService } from '../services/flux-audit'
import type { HonoEnv } from '../types/hono'

import { Hono } from 'hono'

import { authGuard } from '../middlewares/auth'

export function createFluxRoutes(fluxService: FluxService, fluxAuditService: FluxAuditService) {
  return new Hono<HonoEnv>()
    .use('*', authGuard)
    .get('/', async (c) => {
      const user = c.get('user')!
      const flux = await fluxService.getFlux(user.id)
      return c.json(flux)
    })
    .get('/history', async (c) => {
      const user = c.get('user')!
      const limit = Math.min(Math.max(Number(c.req.query('limit') || '20'), 1), 100)
      const offset = Math.max(Number(c.req.query('offset') || '0'), 0)

      const { records, hasMore } = await fluxAuditService.getHistory(user.id, limit, offset)

      return c.json({
        records: records.map(r => ({
          id: r.id,
          type: r.type,
          amount: r.amount,
          description: r.description,
          metadata: r.metadata,
          createdAt: r.createdAt.toISOString(),
        })),
        hasMore,
      })
    })
}
