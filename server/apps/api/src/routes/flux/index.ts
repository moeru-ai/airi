import type { BillingService } from '../../services/domain/billing/billing-service'
import type { FluxService } from '../../services/domain/flux'
import type { FluxTransactionService } from '../../services/domain/flux-transaction'
import type { HonoEnv } from '../../types/hono'

import { createBadRequestError } from '@proj-airi/http-error-shared'
import { Hono } from 'hono'
import { boolean, check, object, parse, pipe, safeParse, string } from 'valibot'

import { authGuard } from '../../middlewares/auth'
import { LimitOffsetPaginationQuerySchema } from '../../utils/http-query'

const FallbackBodySchema = object({ fallbackToFlux: boolean() })

// Intl accepts a fixed offset such as `+08:00`. PostgreSQL reads the sign of that offset the other way.
function isKnownTimeZone(timeZone: string): boolean {
  try {
    const resolved = new Intl.DateTimeFormat('en-CA', { timeZone }).resolvedOptions().timeZone
    return !/^[+-]/.test(resolved)
  }
  catch {
    return false
  }
}

const TimeZoneQuerySchema = object({
  timeZone: pipe(string(), check(isKnownTimeZone)),
})

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
    .get('/usage/daily', async (c) => {
      const user = c.get('user')!
      const query = safeParse(TimeZoneQuerySchema, { timeZone: c.req.query('timeZone') })
      if (!query.success)
        throw createBadRequestError('Invalid time zone', 'INVALID_TIME_ZONE', query.issues)
      return c.json(await fluxTransactionService.getDailyUsage(user.id, query.output.timeZone))
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
