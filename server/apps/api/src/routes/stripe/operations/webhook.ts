import type Stripe from 'stripe'

import type { RevenueMetrics } from '../../../otel'
import type { PaymentProvider, PaymentService } from '../../../services/domain/payment'
import type { ProductEventService } from '../../../services/domain/product-events'

import { useLogger } from '@guiiai/logg'

import { createBadRequestError, createServiceUnavailableError } from '../../../utils/error'
import { errorMessageFromUnknown } from '../../../utils/error-message'

const logger = useLogger('stripe')

export interface WebhookOperationDeps {
  stripe: Stripe | null
  webhookSecret: string | undefined
  stripeAdapter: PaymentProvider
  payment: PaymentService
  metrics?: RevenueMetrics | null
  productEventService?: ProductEventService
}

export interface WebhookOperationInput {
  signature: string | null
  body: string
}

/**
 * Verifies a Stripe webhook, maps the native event through the Stripe adapter,
 * then calls Payment CORE. Subscription and invoice events are logged only.
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
      throw createBadRequestError(`Webhook Error: ${errorMessageFromUnknown(err)}`, 'WEBHOOK_ERROR')
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

        const facts = deps.stripeAdapter.confirmed(session)
        const result = await deps.payment.applyConfirmation(facts)
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
        const facts = deps.stripeAdapter.confirmed(event.data.object)
        await deps.payment.applyConfirmation(facts)
        break
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'invoice.created':
      case 'invoice.updated':
      case 'invoice.paid':
      case 'invoice.payment_failed': {
        logger.withFields({ type: event.type, id: event.id }).log('Ignoring subscription or invoice event until Phase 2')
        break
      }
      default:
        break
    }

    return { received: true }
  }
}
