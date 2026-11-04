import type { Database } from '../../../libs/db'
import type { PaymentOrder } from '../../../schemas/payment'

import { ApiError, createNotFoundError } from '@proj-airi/http-error-shared'
import { and, eq, isNull } from 'drizzle-orm'

import { paymentOrder } from '../../../schemas/payment'

/** The processor reference of an order whose ownership and paid status the service has checked. */
export type ReceiptOrder = Pick<PaymentOrder, 'processor' | 'processorOrderId'>

/** Resolves fresh provider links. Null means unavailable or invalid receipt data. Provider request failures propagate. */
export interface ReceiptResolver {
  readonly processor: string
  resolveReceipt: (order: ReceiptOrder) => Promise<{ url: string } | null>
}

/** Resolves fresh receipt links from each paid order's original processor, regardless of current sales channels. */
export function createPaymentReceiptService(db: Database, resolvers: readonly ReceiptResolver[]) {
  const resolversByProcessor = new Map(resolvers.map(resolver => [resolver.processor, resolver]))

  return {
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

      const resolver = resolversByProcessor.get(order.processor)
      const receipt = await resolver?.resolveReceipt(order)
      if (!receipt)
        throw new ApiError(404, 'PAYMENT_RECEIPT_UNAVAILABLE', 'Payment receipt is unavailable')

      return receipt
    },
  }
}

export type PaymentReceiptService = ReturnType<typeof createPaymentReceiptService>
