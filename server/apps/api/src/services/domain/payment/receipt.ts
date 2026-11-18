import type { Database } from '../../../libs/db'
import type { PaymentReceiptAdapter } from '../../adapters/payment/types'

import { ApiError, createNotFoundError } from '@proj-airi/http-error-shared'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { number, object, pipe, regex, safeParse, string, toUpperCase } from 'valibot'

import { paymentOrder } from '../../../schemas/payment'

const storedAmountSchema = object({
  amount: number(),
  currency: pipe(string(), regex(/^[a-z]{3}$/i), toUpperCase()),
})

export function createPaymentReceiptService(db: Database, adapters: ReadonlyMap<string, PaymentReceiptAdapter>) {
  return {
    async listOrders(userId: string, limit: number, offset: number) {
      const orderDate = sql`coalesce(${paymentOrder.creditedAt}, ${paymentOrder.createdAt})`
      const records = await db.select({
        id: paymentOrder.id,
        processor: paymentOrder.processor,
        status: paymentOrder.status,
        amount: paymentOrder.amount,
        currency: paymentOrder.currency,
        fluxAmount: paymentOrder.fluxAmount,
        creditedAt: paymentOrder.creditedAt,
        createdAt: paymentOrder.createdAt,
      }).from(paymentOrder).where(and(
        eq(paymentOrder.userId, userId),
        eq(paymentOrder.status, 'paid'),
        isNull(paymentOrder.deletedAt),
      )).orderBy(desc(orderDate), desc(paymentOrder.id)).limit(limit + 1).offset(offset)

      return {
        records: records.slice(0, limit).map((record) => {
          const adapter = adapters.get(record.processor)
          const storedAmount = safeParse(storedAmountSchema, record)
          if (!adapter || !storedAmount.success)
            return { ...record, amount: null, currency: null }

          const { amount, currency } = storedAmount.output
          return { ...record, currency, amount: adapter.toMajorUnits(amount, currency) }
        }),
        hasMore: records.length > limit,
      }
    },

    async getReceipt(userId: string, orderId: string) {
      const [order] = await db.select({
        processor: paymentOrder.processor,
        processorOrderId: paymentOrder.processorOrderId,
      }).from(paymentOrder).where(and(
        eq(paymentOrder.id, orderId),
        eq(paymentOrder.userId, userId),
        eq(paymentOrder.status, 'paid'),
        isNull(paymentOrder.deletedAt),
      )).limit(1)

      if (!order)
        throw createNotFoundError('Payment order not found')

      const adapter = adapters.get(order.processor)
      if (adapter) {
        const url = await adapter.resolveReceiptUrl(order.processorOrderId)
        if (url)
          return { url }
      }
      throw new ApiError(404, 'PAYMENT_RECEIPT_UNAVAILABLE', 'Payment receipt is unavailable')
    },
  }
}

export type PaymentReceiptService = ReturnType<typeof createPaymentReceiptService>
