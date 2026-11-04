import type Stripe from 'stripe'

import type { Database } from '../../../libs/db'

import { ApiError, createNotFoundError, createServiceUnavailableError } from '@proj-airi/http-error-shared'
import { and, eq, isNull } from 'drizzle-orm'
import { nullable, object, parse, pipe, startsWith, string, url } from 'valibot'

import { paymentOrder } from '../../../schemas/payment'

const receiptUrlSchema = pipe(string(), url(), startsWith('https://'))
const checkoutReceiptSchema = object({
  invoice: nullable(object({ hosted_invoice_url: nullable(receiptUrlSchema) })),
  payment_intent: nullable(object({
    latest_charge: nullable(object({ receipt_url: nullable(receiptUrlSchema) })),
  })),
})

/** Resolves fresh receipt links from each paid order's original processor, regardless of current sales channels. */
export function createPaymentReceiptService(db: Database, stripe: Stripe | null) {
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

      switch (order.processor) {
        case 'stripe': {
          if (!stripe)
            throw createServiceUnavailableError('Stripe is not configured', 'STRIPE_NOT_CONFIGURED')
          if (!order.processorOrderId)
            throw new ApiError(404, 'PAYMENT_RECEIPT_UNAVAILABLE', 'Payment receipt is unavailable')

          const session = parse(checkoutReceiptSchema, await stripe.checkout.sessions.retrieve(order.processorOrderId, {
            expand: ['invoice', 'payment_intent.latest_charge'],
          }))

          // One-time Checkout payments can have a charge receipt without an invoice.
          const receiptUrl = session.invoice?.hosted_invoice_url ?? session.payment_intent?.latest_charge?.receipt_url
          if (!receiptUrl)
            throw new ApiError(404, 'PAYMENT_RECEIPT_UNAVAILABLE', 'Payment receipt is unavailable')

          return { url: receiptUrl }
        }
        case 'apple_iap':
          // Apple exposes account purchase history without a documented URL for an individual transaction.
          return { url: 'https://reportaproblem.apple.com/' }
        default:
          throw new ApiError(404, 'PAYMENT_RECEIPT_UNAVAILABLE', 'Payment receipt is unavailable')
      }
    },
  }
}

export type PaymentReceiptService = ReturnType<typeof createPaymentReceiptService>
