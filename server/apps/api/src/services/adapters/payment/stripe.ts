import type Stripe from 'stripe'

import type { PaymentReceiptAdapter } from './types'

import { createServiceUnavailableError } from '@proj-airi/http-error-shared'
import { object, pipe, safeParse, startsWith, string, url } from 'valibot'

const receiptUrlSchema = pipe(string(), url(), startsWith('https://'))
const stripeInvoiceSchema = object({
  invoice: object({ hosted_invoice_url: receiptUrlSchema }),
})
const stripeChargeSchema = object({
  payment_intent: object({
    latest_charge: object({ receipt_url: receiptUrlSchema }),
  }),
})

export function createStripeReceiptAdapter(stripe: Stripe | null): PaymentReceiptAdapter {
  return {
    toMajorUnits(amount, currency) {
      const decimalPlaces = currency === 'ISK' || currency === 'UGX'
        ? 2
        : new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 0
      return amount / 10 ** decimalPlaces
    },

    async resolveReceiptUrl(sessionId) {
      if (!stripe)
        throw createServiceUnavailableError('Stripe is not configured', 'STRIPE_NOT_CONFIGURED')
      if (!sessionId)
        return null

      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['invoice', 'payment_intent.latest_charge'],
      })
      const invoice = safeParse(stripeInvoiceSchema, session)
      if (invoice.success)
        return invoice.output.invoice.hosted_invoice_url

      const charge = safeParse(stripeChargeSchema, session)
      return charge.success ? charge.output.payment_intent.latest_charge.receipt_url : null
    },
  }
}
