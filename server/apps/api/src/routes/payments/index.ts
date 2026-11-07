import type { PaymentReceiptService } from '../../services/domain/payment/receipt'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'
import { minLength, object, parse, pipe, string } from 'valibot'

import { authGuard } from '../../middlewares/auth'

const receiptParamsSchema = object({ id: pipe(string(), minLength(1)) })

export function createPaymentRoutes(receipts: PaymentReceiptService) {
  return new Hono<HonoEnv>()
    .use('*', authGuard)
    .get('/:id/receipt', async (c) => {
      const { id } = parse(receiptParamsSchema, c.req.param())
      c.header('Cache-Control', 'no-store')
      return c.json(await receipts.getReceipt(c.get('user')!.id, id))
    })
}
