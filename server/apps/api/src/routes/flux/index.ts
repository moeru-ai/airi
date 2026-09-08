import type { FluxService } from '../../services/domain/flux'
import type { FluxTransactionService } from '../../services/domain/flux-transaction'
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
    .get('/stats', async (c) => {
      const user = c.get('user')!
      const stats = await fluxTransactionService.getStats(user.id)
      return c.json(stats)
    })
    .get('/history', async (c) => {
      const user = c.get('user')!
      const { limit, offset } = parse(LimitOffsetPaginationQuerySchema, {
        limit: c.req.query('limit'),
        offset: c.req.query('offset'),
      })

      return c.json(await fluxTransactionService.getHistoryRows(user.id, limit, offset))
    })
}
