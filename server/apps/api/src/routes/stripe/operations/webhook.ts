import type Stripe from 'stripe'

import type { RevenueMetrics } from '../../../otel'
import type { BillingService } from '../../../services/domain/billing/billing-service'
import type { FluxService } from '../../../services/domain/flux'
import type { ProductEventService } from '../../../services/domain/product-events'
import type { StripeService } from '../../../services/domain/stripe'

import { useLogger } from '@guiiai/logg'

import { createBadRequestError, createServiceUnavailableError } from '../../../utils/error'
import { errorMessageFromUnknown } from '../../../utils/error-message'

const logger = useLogger('stripe')

export interface WebhookOperationDeps {
  billingService: BillingService
  fluxService: FluxService
  metrics?: null | RevenueMetrics
  productEventService?: ProductEventService
  stripe: null | Stripe
  stripeService: StripeService
  webhookSecret: string | undefined
}

export interface WebhookOperationInput {
  body: string
  signature: null | string
}

interface StripeSubscriptionEventContext {
  amountPaid?: number
  currency?: string
  stripeCustomerId: string
  stripePriceId?: string
  stripeSubscriptionId: string
  subscriptionStatus?: string
  userId: string
}

/**
 * Processes Stripe webhook events.
 *
 * Use when:
 * - The route has captured the raw request body.
 * - Stripe signature verification must happen before event dispatch.
 *
 * Expects:
 * - A configured Stripe client and webhook secret.
 *
 * Returns:
 * - `{ received: true }` after known and unknown events are accepted.
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

    logger.withFields({ id: event.id, type: event.type }).log('Webhook event received')
    deps.metrics?.stripeEvents.add(1, { event_type: event.type })

    switch (event.type) {
      case 'checkout.session.completed': {
        const result = await handleCheckoutSessionCompleted(event.id, event.data.object, deps.fluxService, deps.stripeService, deps.billingService)
        deps.metrics?.stripeCheckoutCompleted.add(1)
        // Revenue capture in smallest currency unit (e.g. cents).
        // Cross-currency aggregation is meaningless, so always group by `currency` in queries.
        if (event.data.object.amount_total != null && event.data.object.currency) {
          deps.metrics?.stripeRevenue.add(event.data.object.amount_total, {
            currency: event.data.object.currency,
            source: 'checkout',
          })
        }
        // Record the product conversion only after the handler actually
        // processed the checkout. Malformed sessions (missing userId,
        // invalid fluxAmount) take the early-return path above.
        if (result.processed) {
          const userId = event.data.object.metadata?.userId
          if (userId) {
            const fluxAmount = Number(event.data.object.metadata?.fluxAmount)
            const posthogDistinctId = event.data.object.metadata?.posthogDistinctId
            const posthogSessionId = event.data.object.metadata?.posthogSessionId
            void deps.productEventService?.track({
              action: 'payment_completed',
              eventId: event.data.object.id,
              feature: 'billing',
              metadata: {
                amount_total: event.data.object.amount_total,
                currency: event.data.object.currency,
                flux_amount: Number.isFinite(fluxAmount) ? fluxAmount : null,
                stripe_checkout_session_id: event.data.object.id,
                stripe_customer_id: typeof event.data.object.customer === 'string' ? event.data.object.customer : event.data.object.customer?.id ?? null,
                ...(posthogDistinctId && { posthog_distinct_id: posthogDistinctId }),
                ...(posthogSessionId && { posthog_session_id: posthogSessionId }),
              },
              source: 'stripe.webhook',
              status: 'succeeded',
              userId,
            })
          }
        }
        break
      }
      case 'customer.created':
      case 'customer.updated': {
        await handleCustomerEvent(event.data.object, deps.stripeService)
        break
      }
      case 'customer.subscription.created':
      case 'customer.subscription.deleted':
      case 'customer.subscription.updated': {
        await handleSubscriptionEvent(event.data.object, deps.stripeService)
        deps.metrics?.stripeSubscriptionEvent.add(1, { event_type: event.type.replace('customer.subscription.', '') })
        break
      }
      case 'invoice.created':
      case 'invoice.paid':
      case 'invoice.payment_failed':
      case 'invoice.updated': {
        await handleInvoiceEvent(event.data.object, deps.stripeService)
        if (event.type === 'invoice.payment_failed')
          deps.metrics?.stripePaymentFailed.add(1)
        if (event.type === 'invoice.paid' && event.data.object.amount_paid && event.data.object.currency) {
          deps.metrics?.stripeRevenue.add(event.data.object.amount_paid, {
            currency: event.data.object.currency,
            source: 'invoice',
          })
        }
        break
      }
    }

    return { received: true }
  }
}

async function handleCheckoutSessionCompleted(
  stripeEventId: string,
  session: Stripe.Checkout.Session,
  fluxService: FluxService,
  stripeService: StripeService,
  billingService: BillingService,
): Promise<{ processed: boolean }> {
  const userId = session.metadata?.userId
  if (!userId) {
    logger.withFields({ sessionId: session.id }).warn('Checkout session missing userId in metadata')
    return { processed: false }
  }

  logger.withFields({ amount: session.amount_total, currency: session.currency, mode: session.mode, sessionId: session.id, userId }).log('Processing checkout session')

  // Upsert customer record if we got a customer back.
  if (session.customer) {
    const stripeCustomerId = typeof session.customer === 'string' ? session.customer : session.customer.id
    await stripeService.upsertCustomer({
      email: session.customer_email ?? undefined,
      stripeCustomerId,
      userId,
    })
    await fluxService.updateStripeCustomerId(userId, stripeCustomerId)
  }

  await stripeService.upsertCheckoutSession({
    amountTotal: session.amount_total,
    cancelUrl: session.cancel_url,
    currency: session.currency,
    expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : null,
    metadata: session.metadata ? JSON.stringify(session.metadata) : null,
    mode: session.mode ?? 'payment',
    paymentStatus: session.payment_status,
    status: session.status,
    stripeCustomerId: typeof session.customer === 'string' ? session.customer : session.customer?.id,
    stripePaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id,
    stripeSessionId: session.id,
    stripeSubscriptionId: typeof session.subscription === 'string' ? session.subscription : session.subscription?.id,
    successUrl: session.success_url,
    userId,
  })

  // Idempotent flux credit: use fluxCredited flag inside a transaction
  // to prevent double-crediting on webhook replay.
  //
  // For `payment` mode (one-time Flux purchase) `metadata.fluxAmount` is
  // required — without it we can't credit anything, and the funnel must
  // not see a `payment_completed` event for a checkout that didn't
  // actually deliver Flux. Non-`payment` modes (e.g. `setup` for saving
  // a card) deliberately skip crediting and still count as processed.
  if (session.mode === 'payment') {
    if (session.amount_total == null) {
      logger.withFields({ sessionId: session.id, userId }).warn('Payment-mode checkout missing amount_total; skipping credit and capture')
      return { processed: false }
    }
    const metadataFlux = session.metadata?.fluxAmount
    if (!metadataFlux) {
      logger.withFields({ sessionId: session.id, userId }).warn('Payment-mode checkout missing metadata.fluxAmount; skipping credit and capture')
      return { processed: false }
    }
    const fluxAmount = Number(metadataFlux)
    if (!Number.isFinite(fluxAmount) || fluxAmount <= 0) {
      logger.withFields({ metadataFlux, sessionId: session.id, userId }).warn('Invalid fluxAmount in session metadata, skipping credit')
      return { processed: false }
    }

    const result = await billingService.creditFluxFromStripeCheckout({
      amountTotal: session.amount_total,
      currency: session.currency,
      fluxAmount,
      stripeEventId,
      stripeSessionId: session.id,
      userId,
    })

    logger.withFields({
      amountTotal: session.amount_total,
      applied: result.applied,
      balanceAfter: result.balanceAfter,
      fluxAmount,
      userId,
    }).log('Processed flux credit for one-time payment')
  }

  return { processed: true }
}

async function handleCustomerEvent(
  customer: Stripe.Customer | Stripe.DeletedCustomer,
  stripeService: StripeService,
) {
  if (customer.deleted)
    return

  // Try to find existing customer to get userId.
  const existing = await stripeService.getCustomerByStripeId(customer.id)
  if (!existing)
    return

  await stripeService.upsertCustomer({
    email: customer.email ?? undefined,
    name: customer.name ?? undefined,
    stripeCustomerId: customer.id,
    userId: existing.userId,
  })
}

async function handleInvoiceEvent(
  invoice: Stripe.Invoice,
  stripeService: StripeService,
): Promise<null | StripeSubscriptionEventContext> {
  const stripeCustomerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id
  if (!stripeCustomerId)
    return null

  const customer = await stripeService.getCustomerByStripeId(stripeCustomerId)
  if (!customer)
    return null

  // In newer Stripe API, subscription is under parent.subscription_details.
  const subDetails = invoice.parent?.subscription_details
  const subscriptionId = subDetails
    ? (typeof subDetails.subscription === 'string' ? subDetails.subscription : subDetails.subscription?.id)
    : undefined

  await stripeService.upsertInvoice({
    amountDue: invoice.amount_due,
    amountPaid: invoice.amount_paid,
    currency: invoice.currency,
    invoicePdf: invoice.invoice_pdf,
    invoiceUrl: invoice.hosted_invoice_url,
    metadata: invoice.metadata ? JSON.stringify(invoice.metadata) : null,
    paidAt: invoice.status_transitions?.paid_at ? new Date(invoice.status_transitions.paid_at * 1000) : null,
    periodEnd: new Date(invoice.period_end * 1000),
    periodStart: new Date(invoice.period_start * 1000),
    status: invoice.status,
    stripeCustomerId,
    stripeInvoiceId: invoice.id,
    stripeSubscriptionId: subscriptionId,
    userId: customer.userId,
  })

  // TODO: implement subscription-based flux crediting when subscriptions are enabled
  if (invoice.status === 'paid' && invoice.amount_paid && subscriptionId)
    logger.withFields({ amountPaid: invoice.amount_paid, invoiceId: invoice.id, userId: customer.userId }).warn('Subscription invoice paid but flux crediting for subscriptions is not yet implemented')

  return {
    amountPaid: invoice.amount_paid,
    currency: invoice.currency,
    stripeCustomerId,
    stripeSubscriptionId: subscriptionId ?? '',
    subscriptionStatus: invoice.status ?? undefined,
    userId: customer.userId,
  }
}

async function handleSubscriptionEvent(
  subscription: Stripe.Subscription,
  stripeService: StripeService,
): Promise<null | StripeSubscriptionEventContext> {
  const stripeCustomerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id
  const customer = await stripeService.getCustomerByStripeId(stripeCustomerId)
  if (!customer)
    return null

  // In newer Stripe API, period info is on subscription items.
  const firstItem = subscription.items.data[0]
  await stripeService.upsertSubscription({
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
    currentPeriodEnd: firstItem?.current_period_end ? new Date(firstItem.current_period_end * 1000) : null,
    currentPeriodStart: firstItem?.current_period_start ? new Date(firstItem.current_period_start * 1000) : null,
    endedAt: subscription.ended_at ? new Date(subscription.ended_at * 1000) : null,
    metadata: subscription.metadata ? JSON.stringify(subscription.metadata) : null,
    status: subscription.status,
    stripeCustomerId,
    stripePriceId: firstItem?.price?.id,
    stripeSubscriptionId: subscription.id,
    userId: customer.userId,
  })

  return {
    stripeCustomerId,
    stripePriceId: firstItem?.price?.id,
    stripeSubscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
    userId: customer.userId,
  }
}
