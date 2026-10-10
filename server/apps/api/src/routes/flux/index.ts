import type { BillingService } from '../../services/domain/billing/billing-service'
import type { FluxService } from '../../services/domain/flux'
import type { FluxTransactionService } from '../../services/domain/flux-transaction'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'
import { boolean, object, parse, safeParse } from 'valibot'

import { authGuard } from '../../middlewares/auth'
import { createBadRequestError } from '../../utils/error'
import { LimitOffsetPaginationQuerySchema } from '../../utils/http-query'

const FallbackBodySchema = object({ fallbackToFlux: boolean() })

export function createFluxRoutes(
  fluxService: FluxService,
  fluxTransactionService: FluxTransactionService,
  billingService: Pick<BillingService, 'setFallbackToFlux'>,
) {
  return new Hono<HonoEnv>()
    .use('*', authGuard)
    .get('/', async (c) => {
      const user = c.get('user')!
      const flux = await fluxService.getFlux(user.id)
      return c.json(flux)
    })
    .put('/fallback', async (c) => {
      const user = c.get('user')!
      const body = safeParse(FallbackBodySchema, await c.req.json().catch(() => null))
      if (!body.success)
        throw createBadRequestError('Invalid fallback body', 'INVALID_REQUEST', body.issues)
      // Reading first creates the wallet row of a user who has none.
      await fluxService.getFlux(user.id)
      await billingService.setFallbackToFlux(user.id, body.output.fallbackToFlux)
      return c.json({ fallbackToFlux: body.output.fallbackToFlux })
    })
    .get('/usage', async (c) => {
      const user = c.get('user')!
      const { limit, offset } = parse(LimitOffsetPaginationQuerySchema, {
        limit: c.req.query('limit'),
        offset: c.req.query('offset'),
      })
      const result = await fluxTransactionService.getUsageHistory(user.id, limit, offset)
      return c.json({
        records: result.records.map(record => ({
          ...record,
          createdAt: record.createdAt.toISOString(),
        })),
        hasMore: result.hasMore,
      })
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
