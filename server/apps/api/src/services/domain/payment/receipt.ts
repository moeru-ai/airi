import type Stripe from 'stripe'

import type { Database } from '../../../libs/db'

import { ApiError, createNotFoundError, createServiceUnavailableError } from '@proj-airi/http-error-shared'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { nullable, object, parse, pipe, startsWith, string, url } from 'valibot'

import { paymentOrder } from '../../../schemas/payment'

const receiptUrlSchema = pipe(string(), url(), startsWith('https://'))
const checkoutReceiptSchema = object({
  invoice: nullable(object({ hosted_invoice_url: nullable(receiptUrlSchema) })),
  payment_intent: nullable(object({
    latest_charge: nullable(object({ receipt_url: nullable(receiptUrlSchema) })),
  })),
})

export function createPaymentReceiptService(db: Database, stripe: Stripe | null) {
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

      return { records: records.slice(0, limit), hasMore: records.length > limit }
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

      switch (order.processor) {
        case 'stripe': {
          if (!stripe)
            throw createServiceUnavailableError('Stripe is not configured', 'STRIPE_NOT_CONFIGURED')
          if (!order.processorOrderId)
            throw new ApiError(404, 'PAYMENT_RECEIPT_UNAVAILABLE', 'Payment receipt is unavailable')

          const session = parse(checkoutReceiptSchema, await stripe.checkout.sessions.retrieve(order.processorOrderId, {
            expand: ['invoice', 'payment_intent.latest_charge'],
          }))

          const receiptUrl = session.invoice?.hosted_invoice_url ?? session.payment_intent?.latest_charge?.receipt_url
          if (!receiptUrl)
            throw new ApiError(404, 'PAYMENT_RECEIPT_UNAVAILABLE', 'Payment receipt is unavailable')

          return { url: receiptUrl }
        }
        case 'apple_iap':
          return { url: 'https://reportaproblem.apple.com/' }
        default:
          throw new ApiError(404, 'PAYMENT_RECEIPT_UNAVAILABLE', 'Payment receipt is unavailable')
      }
    },
  }
}

export type PaymentReceiptService = ReturnType<typeof createPaymentReceiptService>
