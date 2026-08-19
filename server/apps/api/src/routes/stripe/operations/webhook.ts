import type Stripe from 'stripe'

import type { RevenueMetrics } from '../../../otel'
import type { PaymentService } from '../../../services/domain/payment'
import type { ProductEventService } from '../../../services/domain/product-events'

import { useLogger } from '@guiiai/logg'
import { errorMessageFrom } from '@moeru/std'

import { createBadRequestError, createServiceUnavailableError } from '../../../utils/error'
import { claimReceiptFromCheckoutSession } from '../claim'

const logger = useLogger('stripe')

export interface WebhookOperationDeps {
  stripe: Stripe | null
  webhookSecret: string | undefined
  payment: PaymentService
  metrics?: RevenueMetrics | null
  productEventService?: ProductEventService
}

export interface WebhookOperationInput {
  signature: string | null
  body: string
}

/**
 * Verifies a Stripe webhook, maps a Checkout Session to a claim receipt,
 * then calls Payment CORE. Unknown events are ignored.
 */
export function createWebhookOperation(deps: WebhookOperationDeps) {
  return async (input: WebhookOperationInput): Promise<{ received: true }> => {
    if (!deps.stripe || !deps.webhookSecret)
      throw createServiceUnavailableError('Stripe is not configured', 'STRIPE_NOT_CONFIGURED')

    if (!input.signature)
      throw createBadRequestError('No signature', 'MISSING_SIGNATURE')

    let event: Stripe.Event
    try {
      event = deps.stripe.webhooks.constructEvent(input.body, input.signature, deps.webhookSecret)
    }
    catch (err: unknown) {
      throw createBadRequestError(`Webhook Error: ${errorMessageFrom(err) ?? 'unknown error'}`, 'WEBHOOK_ERROR')
    }

    logger.withFields({ type: event.type, id: event.id }).log('Webhook event received')
    deps.metrics?.stripeEvents.add(1, { event_type: event.type })

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        if (session.mode !== 'payment') {
          logger.withFields({ sessionId: session.id, mode: session.mode }).log('Ignoring non-payment checkout session')
          break
        }

        const receipt = claimReceiptFromCheckoutSession(session)
        const result = await deps.payment.settle(receipt)
        deps.metrics?.stripeCheckoutCompleted.add(1)
        if (session.amount_total != null && session.currency) {
          deps.metrics?.stripeRevenue.add(session.amount_total, {
            currency: session.currency,
            source: 'checkout',
          })
        }
        if (result.applied) {
          const posthogDistinctId = session.metadata?.posthogDistinctId
          const posthogSessionId = session.metadata?.posthogSessionId
          void deps.productEventService?.track({
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
        const receipt = claimReceiptFromCheckoutSession(event.data.object)
        await deps.payment.settle(receipt)
        break
      }
      default:
        break
    }

    return { received: true }
  }
}
