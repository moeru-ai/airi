import type { PaymentReceiptService } from '../../services/domain/payment/receipt'
import type { HonoEnv } from '../../types/hono'

import { ok, paginated } from '@proj-airi/http-shared'
import { Hono } from 'hono'
import { minLength, object, parse, pipe, string } from 'valibot'

import { authGuard } from '../../middlewares/auth'
import { LimitOffsetPaginationQuerySchema } from '../../utils/http-query'

const receiptParamsSchema = object({ id: pipe(string(), minLength(1)) })

export function createPaymentRoutes(receipts: PaymentReceiptService) {
  return new Hono<HonoEnv>()
    .use('*', authGuard)
    .get('/', async (c) => {
      const { limit, offset } = parse(LimitOffsetPaginationQuerySchema, {
        limit: c.req.query('limit'),
        offset: c.req.query('offset'),
      })
      c.header('Cache-Control', 'no-store')
      const { records, hasMore } = await receipts.listOrders(c.get('user')!.id, limit, offset)
      return paginated(c, {
        records: records.map(record => ({
          ...record,
          creditedAt: record.creditedAt?.toISOString() ?? null,
          createdAt: record.createdAt.toISOString(),
        })),
        hasMore,
      })
    })
    .get('/:id/receipt', async (c) => {
      const { id } = parse(receiptParamsSchema, c.req.param())
      c.header('Cache-Control', 'no-store')
      return ok(c, await receipts.getReceipt(c.get('user')!.id, id))
    })
}
