import type Stripe from 'stripe'

import type { Database } from '../../../libs/db'
import type { RevenueMetrics } from '../../../otel'
import type { PaymentService } from '../../../services/domain/payment'
import type { ProductEventService } from '../../../services/domain/product-events'

import { useLogger } from '@guiiai/logg'
import { errorMessageFrom } from '@moeru/std'
import { and, eq } from 'drizzle-orm'

import { createBadRequestError, createInternalError, createServiceUnavailableError } from '../../../utils/error'
import { claimReceiptFromCheckoutSession } from '../claim'

import * as paymentSchema from '../../../schemas/payment'

const logger = useLogger('stripe')

/**
 * Finds the `payment_order` id for a verified Checkout Session.
 *
 * New Sessions store `metadata.payment_order_id`. Sessions copied by
 * `0023_payment_order.sql` are found by Stripe session id.
 */
async function resolvePaymentOrderId(
  db: Database,
  session: Stripe.Checkout.Session,
): Promise<string> {
  const fromMetadata = session.metadata?.payment_order_id
  if (fromMetadata)
    return fromMetadata

  const [existing] = await db
    .select({ id: paymentSchema.paymentOrder.id })
    .from(paymentSchema.paymentOrder)
    .where(and(
      eq(paymentSchema.paymentOrder.processor, 'stripe'),
      eq(paymentSchema.paymentOrder.processorOrderId, session.id),
    ))
    .limit(1)

  if (existing)
    return existing.id

  throw createInternalError('Payment confirmation is missing payment_order_id')
}

/**
 * Verifies a Stripe webhook, maps a Checkout Session to a claim receipt,
 * then calls Payment CORE. Unknown events are ignored.
 */
export function createWebhookOperation(
  stripe: Stripe | null,
  webhookSecret: string | null,
  payment: PaymentService,
  db: Database,
  metrics: RevenueMetrics | null,
  productEventService: ProductEventService | null,
) {
  return async (signature: string | null, body: string): Promise<{ received: true }> => {
    if (!stripe || !webhookSecret)
      throw createServiceUnavailableError('Stripe is not configured', 'STRIPE_NOT_CONFIGURED')

    if (!signature)
      throw createBadRequestError('No signature', 'MISSING_SIGNATURE')

    let event: Stripe.Event
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
    }
    catch (err: unknown) {
      throw createBadRequestError(`Webhook Error: ${errorMessageFrom(err) ?? 'unknown error'}`, 'WEBHOOK_ERROR')
    }

    logger.withFields({ type: event.type, id: event.id }).log('Webhook event received')
    metrics?.stripeEvents.add(1, { event_type: event.type })

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        if (session.mode !== 'payment') {
          logger.withFields({ sessionId: session.id, mode: session.mode }).log('Ignoring non-payment checkout session')
          break
        }

        const paymentOrderId = await resolvePaymentOrderId(db, session)
        const receipt = claimReceiptFromCheckoutSession(session, paymentOrderId)
        const result = await payment.settle(receipt)
        metrics?.stripeCheckoutCompleted.add(1)
        if (session.amount_total != null && session.currency) {
          metrics?.stripeRevenue.add(session.amount_total, {
            currency: session.currency,
            source: 'checkout',
          })
        }
        if (result.applied) {
          const posthogDistinctId = session.metadata?.posthogDistinctId
          const posthogSessionId = session.metadata?.posthogSessionId
          void productEventService?.track({
            userId: result.userId,
            feature: 'billing',
            action: 'payment_completed',
            status: 'succeeded',
            source: 'stripe.webhook',
            metadata: {
              amount_total: session.amount_total,
              currency: session.currency,
              flux_amount: result.fluxAmount,
              pack_key: session.metadata?.packKey ?? null,
              stripe_checkout_session_id: session.id,
              stripe_customer_id: typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null,
              ...(posthogDistinctId && { posthog_distinct_id: posthogDistinctId }),
              ...(posthogSessionId && { posthog_session_id: posthogSessionId }),
            },
          })
        }
        break
      }
      case 'checkout.session.expired': {
        const session = event.data.object
        const paymentOrderId = await resolvePaymentOrderId(db, session)
        const receipt = claimReceiptFromCheckoutSession(session, paymentOrderId)
        await payment.settle(receipt)
        break
      }
      default:
        break
    }

    return { received: true }
  }
}
