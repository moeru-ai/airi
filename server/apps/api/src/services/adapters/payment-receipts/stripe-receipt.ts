import type Stripe from 'stripe'

import type { ReceiptResolver } from '../../domain/payment/receipt'

import { createServiceUnavailableError } from '@proj-airi/http-error-shared'
import { nullable, object, pipe, safeParse, startsWith, string, url } from 'valibot'

const receiptUrlSchema = pipe(string(), url(), startsWith('https://'))
const checkoutReceiptSchema = object({
  invoice: nullable(object({ hosted_invoice_url: nullable(receiptUrlSchema) })),
  payment_intent: nullable(object({
    latest_charge: nullable(object({ receipt_url: nullable(receiptUrlSchema) })),
  })),
})

/** Retrieves the original Checkout Session and validates its expanded receipt URLs. Invalid provider data returns null. */
export function createStripeReceiptResolver(stripe: Stripe | null): ReceiptResolver {
  return {
    processor: 'stripe',
    async resolveReceipt(order) {
      if (!stripe)
        throw createServiceUnavailableError('Stripe is not configured', 'STRIPE_NOT_CONFIGURED')
      if (!order.processorOrderId)
        return null

      const session = safeParse(checkoutReceiptSchema, await stripe.checkout.sessions.retrieve(order.processorOrderId, {
        expand: ['invoice', 'payment_intent.latest_charge'],
      }))
      if (!session.success)
        return null

      // One-time Checkout payments can have a charge receipt without an invoice.
      const receiptUrl = session.output.invoice?.hosted_invoice_url ?? session.output.payment_intent?.latest_charge?.receipt_url
      return receiptUrl ? { url: receiptUrl } : null
    },
  }
}
