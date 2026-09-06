import type Stripe from 'stripe'

import type { Env } from '../../../libs/env'
import type { RevenueMetrics } from '../../../otel'
import type { ConfigKVService } from '../../../services/adapters/config-kv'
import type { PaymentService } from '../../../services/domain/payment'
import type { ProductEventService } from '../../../services/domain/product-events'

import { safeParse } from 'valibot'

import { createBadRequestError, createServiceUnavailableError } from '../../../utils/error'
import { resolveCheckoutRedirectBase } from '../../../utils/origin'
import { CheckoutBodySchema } from '../schema'

/**
 * Opens a pending order through Payment CORE, then creates a Stripe Checkout Session.
 *
 * `{ packKey }` resolves a Flux pack.
 */
export function createCheckoutOperation(
  payment: PaymentService,
  stripe: Stripe | null,
  configKV: ConfigKVService,
  env: Env,
  metrics: RevenueMetrics | null,
  productEventService: ProductEventService | null,
) {
  return async (
    user: { id: string, email: string },
    body: unknown,
    request: Request,
  ): Promise<{ url: string }> => {
    if (!stripe)
      throw createServiceUnavailableError('Stripe is not configured', 'STRIPE_NOT_CONFIGURED')

    const parsed = safeParse(CheckoutBodySchema, body)
    if (!parsed.success)
      throw createBadRequestError('Invalid checkout request', 'INVALID_REQUEST', parsed.issues)

    const { packKey, currency } = parsed.output
    const packs = await configKV.getOptional('FLUX_PACKS') ?? []
    const pack = packs.find(item => item.key === packKey)
    if (!pack)
      throw createBadRequestError('Invalid pack', 'INVALID_PACKAGE', { packKey })
    const priceId = pack.processors.stripe?.priceId
    if (!priceId)
      throw createServiceUnavailableError('Stripe pack mapping is missing', 'STRIPE_PACK_NOT_MAPPED', { packKey: pack.key })

    const redirectBase = resolveCheckoutRedirectBase(request, env.ADDITIONAL_TRUSTED_ORIGINS, env.WEB_APP_URL)
    const posthogIdentity = readPosthogIdentityHeaders(request)

    const order = await payment.openPending({
      userId: user.id,
      processor: 'stripe',
      packKey: pack.key,
      fluxAmount: pack.fluxAmount,
      currency,
    })

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'payment',
      allow_promotion_codes: true,
      success_url: `${redirectBase}/settings/flux?success=true`,
      cancel_url: `${redirectBase}/settings/flux?canceled=true`,
      customer: order.customerId,
      customer_email: order.customerId ? undefined : user.email,
      metadata: {
        payment_order_id: order.id,
        userId: user.id,
        packKey: pack.key,
        fluxAmount: String(pack.fluxAmount),
        ...(posthogIdentity.distinctId && { posthogDistinctId: posthogIdentity.distinctId }),
        ...(posthogIdentity.sessionId && { posthogSessionId: posthogIdentity.sessionId }),
      },
    }

    const paymentMethods = await configKV.getOptional('STRIPE_PAYMENT_METHODS')
    const paymentMethodOptions = await configKV.getOptional('STRIPE_PAYMENT_METHOD_OPTIONS') ?? {}

    if (paymentMethods)
      sessionParams.payment_method_types = paymentMethods as Stripe.Checkout.SessionCreateParams['payment_method_types']

    if (Object.keys(paymentMethodOptions).length > 0)
      sessionParams.payment_method_options = paymentMethodOptions as Stripe.Checkout.SessionCreateParams['payment_method_options']

    if (currency)
      sessionParams.currency = currency

    let session: Stripe.Checkout.Session
    try {
      session = await stripe.checkout.sessions.create(sessionParams)
    }
    catch (error) {
      await payment.abandon(order.id)
      throw error
    }

    if (!session.url) {
      await payment.abandon(order.id)
      throw createServiceUnavailableError('Stripe checkout did not return a URL', 'STRIPE_CHECKOUT_URL_MISSING')
    }

    await payment.bindProcessorOrder(order.id, {
      processorOrderId: session.id,
      amount: session.amount_total ?? undefined,
      currency: session.currency ?? currency,
    })

    metrics?.stripeCheckoutCreated.add(1)
    void productEventService?.track({
      userId: user.id,
      feature: 'billing',
      action: 'checkout_started',
      status: 'succeeded',
      eventId: order.id,
      source: 'stripe.checkout',
      metadata: {
        pack_key: pack.key,
        ...(posthogIdentity.distinctId && { posthog_distinct_id: posthogIdentity.distinctId }),
        ...(posthogIdentity.sessionId && { posthog_session_id: posthogIdentity.sessionId }),
      },
    })

    return { url: session.url }
  }
}

function readPosthogIdentityHeaders(request: Request) {
  const distinctId = readStripeMetadataHeader(request, 'x-posthog-distinct-id')
  const sessionId = readStripeMetadataHeader(request, 'x-posthog-session-id')
  return {
    ...(distinctId && { distinctId }),
    ...(sessionId && { sessionId }),
  }
}

function readStripeMetadataHeader(request: Request, name: string) {
  const value = request.headers.get(name)?.trim()
  if (!value)
    return undefined

  return value.slice(0, 200)
}
