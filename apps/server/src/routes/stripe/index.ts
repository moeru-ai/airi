import type { Env } from '../../libs/env'
import type { RevenueMetrics } from '../../libs/otel'
import type { BillingService } from '../../services/billing/billing-service'
import type { ConfigKVService } from '../../services/config-kv'
import type { FluxService } from '../../services/flux'
import type { StripeService } from '../../services/stripe'
import type { HonoEnv } from '../../types/hono'

import Stripe from 'stripe'

import { useLogger } from '@guiiai/logg'
import { Hono } from 'hono'
import { safeParse } from 'valibot'

import { authGuard } from '../../middlewares/auth'
import { configGuard } from '../../middlewares/config-guard'
import { rateLimiter } from '../../middlewares/rate-limit'
import { createBadRequestError, createServiceUnavailableError } from '../../utils/error'
import { errorMessageFromUnknown } from '../../utils/error-message'
import { resolveTrustedRequestOrigin } from '../../utils/origin'
import { CheckoutBodySchema } from './schema'

const logger = useLogger('stripe')

export function createStripeRoutes(
  fluxService: FluxService,
  stripeService: StripeService,
  billingService: BillingService,
  configKV: ConfigKVService,
  env: Env,
  metrics?: RevenueMetrics | null,
) {
  const stripe = env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : null

  const fluxConfigGuard = configGuard(configKV, ['FLUX_PACKAGES'], 'Top-up is not available yet')

  return new Hono<HonoEnv>()
    .get('/packages', async (c) => {
      const packages = await configKV.get('FLUX_PACKAGES')
      return c.json(packages)
    })
    .post('/checkout', authGuard, rateLimiter({ max: 10, windowSec: 60 }), fluxConfigGuard, async (c) => {
      if (!stripe)
        throw createServiceUnavailableError('Stripe is not configured', 'STRIPE_NOT_CONFIGURED')

      const user = c.get('user')!
      const body = await c.req.json()
      const maxCheckoutAmount = await configKV.get('MAX_CHECKOUT_AMOUNT_CENTS')

      const result = safeParse(CheckoutBodySchema, body)
      if (!result.success)
        throw createBadRequestError('Invalid checkout amount', 'INVALID_REQUEST', result.issues)

      const { amount } = result.output
      if (amount > maxCheckoutAmount) {
        throw createBadRequestError('Invalid checkout amount', 'INVALID_REQUEST', {
          amount,
          maxCheckoutAmount,
        })
      }

      // Match amount to a configured package so we know the fluxAmount
      const packages = await configKV.get('FLUX_PACKAGES')
      const pkg = packages.find(p => p.amount === amount)
      if (!pkg) {
        throw createBadRequestError('No matching package for the given amount', 'INVALID_PACKAGE', { amount })
      }

      // Reuse existing stripe customer if available
      const customer = await stripeService.getCustomerByUserId(user.id)
      const stripeCustomerId = customer?.stripeCustomerId

      const redirectBase = resolveTrustedRequestOrigin(c.req.raw)
      if (!redirectBase) {
        throw createBadRequestError('Missing trusted request origin', 'INVALID_ORIGIN')
      }

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: 'Flux Top-up',
              },
              unit_amount: amount,
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        allow_promotion_codes: true,
        success_url: `${redirectBase}/settings/flux?success=true`,
        cancel_url: `${redirectBase}/settings/flux?canceled=true`,
        customer: stripeCustomerId,
        customer_email: stripeCustomerId ? undefined : user.email,
        metadata: {
          userId: user.id,
          fluxAmount: String(pkg.fluxAmount),
        },
      })

      // Persist the checkout session
      await stripeService.upsertCheckoutSession({
        userId: user.id,
        stripeSessionId: session.id,
        stripeCustomerId: typeof session.customer === 'string' ? session.customer : session.customer?.id,
        mode: session.mode ?? 'payment',
        status: session.status,
        paymentStatus: session.payment_status,
        amountTotal: session.amount_total,
        currency: session.currency,
        successUrl: session.success_url,
        cancelUrl: session.cancel_url,
        stripePaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id,
        stripeSubscriptionId: typeof session.subscription === 'string' ? session.subscription : session.subscription?.id,
        metadata: session.metadata ? JSON.stringify(session.metadata) : null,
        expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : null,
      })

      metrics?.stripeCheckoutCreated.add(1)

      return c.json({ url: session.url })
    })

    // ---- Orders / checkout sessions history ----
    .get('/orders', authGuard, async (c) => {
      const user = c.get('user')!
      const sessions = await stripeService.getCheckoutSessionsByUserId(user.id)
      return c.json(sessions)
    })

    // ---- Invoices history ----
    .get('/invoices', authGuard, async (c) => {
      const user = c.get('user')!
      const invoices = await stripeService.getInvoicesByUserId(user.id)
      return c.json(invoices)
    })

    // ---- Customer portal ----
    .post('/portal', authGuard, async (c) => {
      if (!stripe)
        throw createServiceUnavailableError('Stripe is not configured', 'STRIPE_NOT_CONFIGURED')

      const user = c.get('user')!
      const customer = await stripeService.getCustomerByUserId(user.id)
      if (!customer)
        throw createBadRequestError('No billing account found', 'NO_CUSTOMER')

      const portalReturnBase = resolveTrustedRequestOrigin(c.req.raw)
      if (!portalReturnBase) {
        throw createBadRequestError('Missing trusted request origin', 'INVALID_ORIGIN')
      }

      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customer.stripeCustomerId,
        return_url: `${portalReturnBase}/settings/flux`,
      })

      return c.json({ url: portalSession.url })
    })

    // ---- Webhook ----
    .post('/webhook', async (c) => {
      if (!stripe || !env.STRIPE_WEBHOOK_SECRET)
        throw createServiceUnavailableError('Stripe is not configured', 'STRIPE_NOT_CONFIGURED')

      const sig = c.req.header('stripe-signature')
      if (!sig)
        throw createBadRequestError('No signature', 'MISSING_SIGNATURE')

      let event: Stripe.Event
      try {
        const body = await c.req.text()
        event = stripe.webhooks.constructEvent(body, sig, env.STRIPE_WEBHOOK_SECRET)
      }
      catch (err: unknown) {
        throw createBadRequestError(`Webhook Error: ${errorMessageFromUnknown(err)}`, 'WEBHOOK_ERROR')
      }

      logger.withFields({ type: event.type, id: event.id }).log('Webhook event received')
      metrics?.stripeEvents.add(1, { event_type: event.type })

      switch (event.type) {
        case 'checkout.session.completed': {
          await handleCheckoutSessionCompleted(event.id, event.data.object, fluxService, stripeService, billingService)
          metrics?.stripeCheckoutCompleted.add(1)
          break
        }
        case 'customer.created':
        case 'customer.updated': {
          await handleCustomerEvent(event.data.object, stripeService)
          break
        }
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted': {
          await handleSubscriptionEvent(event.data.object, stripeService)
          metrics?.stripeSubscriptionEvent.add(1, { event_type: event.type.replace('customer.subscription.', '') })
          break
        }
        case 'invoice.created':
        case 'invoice.updated':
        case 'invoice.paid':
        case 'invoice.payment_failed': {
          await handleInvoiceEvent(event.data.object, stripeService)
          if (event.type === 'invoice.payment_failed') {
            metrics?.stripePaymentFailed.add(1)
          }
          break
        }
      }

      return c.json({ received: true })
    })
}

// ---- Webhook handlers ----

async function handleCheckoutSessionCompleted(
  stripeEventId: string,
  session: Stripe.Checkout.Session,
  fluxService: FluxService,
  stripeService: StripeService,
  billingService: BillingService,
) {
  const userId = session.metadata?.userId
  if (!userId) {
    logger.withFields({ sessionId: session.id }).warn('Checkout session missing userId in metadata')
    return
  }

  logger.withFields({ userId, sessionId: session.id, mode: session.mode, amount: session.amount_total, currency: session.currency }).log('Processing checkout session')

  // Upsert customer record if we got a customer back
  if (session.customer) {
    const stripeCustomerId = typeof session.customer === 'string' ? session.customer : session.customer.id
    await stripeService.upsertCustomer({
      userId,
      stripeCustomerId,
      email: session.customer_email ?? undefined,
    })
    await fluxService.updateStripeCustomerId(userId, stripeCustomerId)
  }

  // Update the checkout session record
  await stripeService.upsertCheckoutSession({
    userId,
    stripeSessionId: session.id,
    stripeCustomerId: typeof session.customer === 'string' ? session.customer : session.customer?.id,
    mode: session.mode ?? 'payment',
    status: session.status,
    paymentStatus: session.payment_status,
    amountTotal: session.amount_total,
    currency: session.currency,
    successUrl: session.success_url,
    cancelUrl: session.cancel_url,
    stripePaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id,
    stripeSubscriptionId: typeof session.subscription === 'string' ? session.subscription : session.subscription?.id,
    metadata: session.metadata ? JSON.stringify(session.metadata) : null,
    expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : null,
  })

  // Idempotent flux credit: use fluxCredited flag inside a transaction
  // to prevent double-crediting on webhook replay
  const metadataFlux = session.metadata?.fluxAmount
  if (session.mode === 'payment' && session.amount_total != null && metadataFlux) {
    const fluxAmount = Number(metadataFlux)
    if (!Number.isFinite(fluxAmount) || fluxAmount <= 0) {
      logger.withFields({ userId, sessionId: session.id, metadataFlux }).warn('Invalid fluxAmount in session metadata, skipping credit')
      return
    }

    const result = await billingService.creditFluxFromStripeCheckout({
      stripeEventId,
      userId,
      stripeSessionId: session.id,
      amountTotal: session.amount_total,
      currency: session.currency,
      fluxAmount,
    })

    logger.withFields({
      userId,
      fluxAmount,
      amountTotal: session.amount_total,
      applied: result.applied,
      balanceAfter: result.balanceAfter,
    }).log('Processed flux credit for one-time payment')
  }
}

async function handleCustomerEvent(
  customer: Stripe.Customer | Stripe.DeletedCustomer,
  stripeService: StripeService,
) {
  if (customer.deleted)
    return

  // Try to find existing customer to get userId
  const existing = await stripeService.getCustomerByStripeId(customer.id)
  if (!existing)
    return // We don't know the userId yet; will be linked on checkout

  await stripeService.upsertCustomer({
    userId: existing.userId,
    stripeCustomerId: customer.id,
    email: customer.email ?? undefined,
    name: customer.name ?? undefined,
  })
}

async function handleSubscriptionEvent(
  subscription: Stripe.Subscription,
  stripeService: StripeService,
) {
  const stripeCustomerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id
  const customer = await stripeService.getCustomerByStripeId(stripeCustomerId)
  if (!customer)
    return

  // In newer Stripe API, period info is on subscription items
  const firstItem = subscription.items.data[0]
  await stripeService.upsertSubscription({
    userId: customer.userId,
    stripeSubscriptionId: subscription.id,
    stripeCustomerId,
    stripePriceId: firstItem?.price?.id,
    status: subscription.status,
    currentPeriodStart: firstItem?.current_period_start ? new Date(firstItem.current_period_start * 1000) : null,
    currentPeriodEnd: firstItem?.current_period_end ? new Date(firstItem.current_period_end * 1000) : null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
    endedAt: subscription.ended_at ? new Date(subscription.ended_at * 1000) : null,
    metadata: subscription.metadata ? JSON.stringify(subscription.metadata) : null,
  })
}

async function handleInvoiceEvent(
  invoice: Stripe.Invoice,
  stripeService: StripeService,
) {
  const stripeCustomerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id
  if (!stripeCustomerId)
    return

  const customer = await stripeService.getCustomerByStripeId(stripeCustomerId)
  if (!customer)
    return

  // In newer Stripe API, subscription is under parent.subscription_details
  const subDetails = invoice.parent?.subscription_details
  const subscriptionId = subDetails
    ? (typeof subDetails.subscription === 'string' ? subDetails.subscription : subDetails.subscription?.id)
    : undefined

  await stripeService.upsertInvoice({
    userId: customer.userId,
    stripeInvoiceId: invoice.id,
    stripeCustomerId,
    stripeSubscriptionId: subscriptionId,
    status: invoice.status,
    amountDue: invoice.amount_due,
    amountPaid: invoice.amount_paid,
    currency: invoice.currency,
    invoiceUrl: invoice.hosted_invoice_url,
    invoicePdf: invoice.invoice_pdf,
    periodStart: new Date(invoice.period_start * 1000),
    periodEnd: new Date(invoice.period_end * 1000),
    paidAt: invoice.status_transitions?.paid_at ? new Date(invoice.status_transitions.paid_at * 1000) : null,
    metadata: invoice.metadata ? JSON.stringify(invoice.metadata) : null,
  })

  // TODO: implement subscription-based flux crediting when subscriptions are enabled
  if (invoice.status === 'paid' && invoice.amount_paid && subscriptionId) {
    logger.withFields({ userId: customer.userId, invoiceId: invoice.id, amountPaid: invoice.amount_paid }).warn('Subscription invoice paid but flux crediting for subscriptions is not yet implemented')
  }
}
