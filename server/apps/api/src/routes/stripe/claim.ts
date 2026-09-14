import type { InferOutput } from 'valibot'

import type { ClaimReceipt } from '../../services/domain/payment'

import { nullable, number, object, optional, parse, picklist, record, string, union } from 'valibot'

const processorReference = nullable(union([string(), object({ id: string() })]))

/** Fields consumed after Stripe verifies the event signature. */
export const checkoutSessionSchema = object({
  id: string(),
  mode: picklist(['payment', 'subscription', 'setup']),
  status: nullable(picklist(['open', 'complete', 'expired'])),
  payment_status: picklist(['paid', 'unpaid', 'no_payment_required']),
  amount_total: optional(nullable(number())),
  currency: optional(nullable(string())),
  customer: optional(processorReference),
  payment_intent: optional(processorReference),
  metadata: optional(nullable(record(string(), string()))),
})

export type CheckoutSession = InferOutput<typeof checkoutSessionSchema>

/** Returns no claim while payment is pending. Expiration never grants Flux. */
export function claimReceiptFromCheckoutSession(
  input: unknown,
  paymentOrderId: string,
): ClaimReceipt | null {
  const session = parse(checkoutSessionSchema, input)
  if (session.status !== 'expired' && (session.status !== 'complete' || session.payment_status === 'unpaid'))
    return null

  return {
    kind: 'claim',
    processor: 'stripe',
    paymentOrderId,
    processorOrderId: session.id,
    status: session.status === 'expired' ? 'expired' : 'paid',
    amount: session.amount_total ?? undefined,
    currency: session.currency ?? undefined,
    customerId: typeof session.customer === 'string' ? session.customer : session.customer?.id,
    extras: {
      sessionId: session.id,
      paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id,
      mode: session.mode,
      paymentStatus: session.payment_status,
    },
  }
}
