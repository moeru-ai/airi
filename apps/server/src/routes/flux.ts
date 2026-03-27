import type { FluxService } from '../services/flux'
import type { FluxAuditService } from '../services/flux-audit'
import type { HonoEnv } from '../types/hono'

import { Hono } from 'hono'
import { fallback, integer, nonEmpty, object, optional, parse, pipe, string, transform } from 'valibot'

import { authGuard } from '../middlewares/auth'

const FluxHistoryQuerySchema = object({
  limit: fallback(
    pipe(
      optional(string(), '20'),
      nonEmpty(),
      transform(input => Number.parseInt(input, 10)),
      integer(),
      transform(value => Math.min(Math.max(value, 1), 100)),
    ),
    20,
  ),
  offset: fallback(
    pipe(
      optional(string(), '0'),
      nonEmpty(),
      transform(input => Number.parseInt(input, 10)),
      integer(),
      transform(value => Math.max(value, 0)),
    ),
    0,
  ),
})

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
      const { limit, offset } = parse(FluxHistoryQuerySchema, {
        limit: c.req.query('limit'),
        offset: c.req.query('offset'),
      })

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
