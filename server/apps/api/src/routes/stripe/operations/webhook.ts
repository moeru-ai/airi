import type Stripe from 'stripe'

import type { RevenueMetrics } from '../../../otel'
import type { PaymentService } from '../../../services/domain/payment'
import type { ProductEventService } from '../../../services/domain/product-events'

import { useLogger } from '@guiiai/logg'
import { parse } from 'valibot'

import { createBadRequestError, createServiceUnavailableError } from '../../../utils/error'
import { errorMessageFromUnknown } from '../../../utils/error-message'
import { checkoutSessionSchema, claimReceiptFromCheckoutSession } from '../claim'

const logger = useLogger('stripe')

/**
 * Verifies a Stripe webhook, maps a Checkout Session to a claim receipt,
 * then calls Payment CORE. Unknown events are ignored.
 */
export function createWebhookOperation(
  stripe: Stripe | null,
  webhookSecret: string | null,
  payment: PaymentService,
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
      throw createBadRequestError(`Webhook Error: ${errorMessageFromUnknown(err)}`, 'WEBHOOK_ERROR')
    }

    logger.withFields({ type: event.type, id: event.id }).log('Webhook event received')
    metrics?.stripeEvents.add(1, { event_type: event.type })

    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = parse(checkoutSessionSchema, event.data.object)
        if (session.mode !== 'payment') {
          logger.withFields({ sessionId: session.id, mode: session.mode }).log('Ignoring non-payment checkout session')
          break
        }

        const paymentOrderId = session.metadata?.payment_order_id
        if (!paymentOrderId) {
          logger.withFields({ sessionId: session.id }).warn('Ignoring checkout session without payment_order_id')
          break
        }

        const receipt = claimReceiptFromCheckoutSession(session, paymentOrderId)
        if (!receipt)
          break
        const result = await payment.settle(receipt)
        if (result.applied)
          metrics?.stripeCheckoutCompleted.add(1)
        if (result.applied && session.amount_total != null && session.currency) {
          metrics?.stripeRevenue.add(session.amount_total, {
            currency: session.currency ?? null,
            source: 'checkout',
          })
        }
        if (result.applied) {
          const openpanelDeviceId = session.metadata?.openpanelDeviceId
          const openpanelSessionId = session.metadata?.openpanelSessionId
          void productEventService?.track({
            userId: result.userId,
            feature: 'billing',
            action: 'payment_completed',
            status: 'succeeded',
            source: 'stripe.webhook',
            metadata: {
              amount_total: session.amount_total ?? null,
              currency: session.currency ?? null,
              flux_amount: result.fluxAmount,
              stripe_price_id: session.metadata?.stripePriceId ?? null,
              stripe_checkout_session_id: session.id,
              stripe_customer_id: typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null,
              ...(openpanelDeviceId && { openpanel_device_id: openpanelDeviceId }),
              ...(openpanelSessionId && { openpanel_session_id: openpanelSessionId }),
            },
          })
        }
        break
      }
      case 'checkout.session.expired':
      case 'checkout.session.async_payment_failed': {
        const session = parse(checkoutSessionSchema, event.data.object)
        const paymentOrderId = session.metadata?.payment_order_id
        if (!paymentOrderId) {
          logger.withFields({ sessionId: session.id }).warn('Ignoring checkout session without payment_order_id')
          break
        }

        if (event.type === 'checkout.session.async_payment_failed') {
          await payment.settle({ kind: 'claim', processor: 'stripe', paymentOrderId, processorOrderId: session.id, status: 'canceled' })
          break
        }
        const receipt = claimReceiptFromCheckoutSession(session, paymentOrderId)
        if (receipt)
          await payment.settle(receipt)
        break
      }
      default:
        break
    }

    return { received: true }
  }
}
