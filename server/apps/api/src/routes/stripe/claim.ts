import type Stripe from 'stripe'

import type { ClaimReceipt } from '../../services/domain/payment'

import { createInternalError } from '../../utils/error'

/**
 * Maps a verified Stripe Checkout Session onto a CORE claim receipt.
 */
export function claimReceiptFromCheckoutSession(session: Stripe.Checkout.Session): ClaimReceipt {
  const providerCustomerId = typeof session.customer === 'string'
    ? session.customer
    : session.customer?.id

  const paymentOrderId = session.metadata?.payment_order_id
  if (!paymentOrderId)
    throw createInternalError('Payment confirmation is missing payment_order_id')

  const status = session.status === 'expired' ? 'expired' : 'paid'

  return {
    kind: 'claim',
    provider: 'stripe',
    paymentOrderId,
    providerOrderId: session.id,
    status,
    amount: session.amount_total ?? undefined,
    currency: session.currency ?? undefined,
    providerCustomerId,
    extras: {
      sessionId: session.id,
      customerId: providerCustomerId,
      paymentIntentId: typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id,
      mode: session.mode,
      paymentStatus: session.payment_status,
    },
  }
}
