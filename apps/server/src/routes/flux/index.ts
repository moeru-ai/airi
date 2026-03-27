import type { FluxService } from '../../services/flux'
import type { FluxTransactionService } from '../../services/flux-transaction'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'
import { parse } from 'valibot'

import { authGuard } from '../../middlewares/auth'
import { LimitOffsetPaginationQuerySchema } from '../../utils/http-query'

export function createFluxRoutes(
  fluxService: FluxService,
  fluxTransactionService: FluxTransactionService,
) {
  return new Hono<HonoEnv>()
    .use('*', authGuard)
    .get('/', async (c) => {
      const user = c.get('user')!
      const flux = await fluxService.getFlux(user.id)
      return c.json(flux)
    })
    .get('/history', async (c) => {
      const user = c.get('user')!
      const { limit, offset } = parse(LimitOffsetPaginationQuerySchema, {
        limit: c.req.query('limit'),
        offset: c.req.query('offset'),
      })

      const { records, hasMore } = await fluxTransactionService.getHistory(user.id, limit, offset)

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
