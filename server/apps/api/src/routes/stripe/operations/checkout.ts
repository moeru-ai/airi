import type Stripe from 'stripe'

import type { Env } from '../../../libs/env'
import type { RevenueMetrics } from '../../../otel'
import type { ConfigKVService } from '../../../services/adapters/config-kv'
import type { PaymentService } from '../../../services/domain/payment'
import type { ProductEventService } from '../../../services/domain/product-events'
import type { StripePriceCatalog } from '../price-catalog'

import { safeParse } from 'valibot'

import { createBadRequestError, createServiceUnavailableError } from '../../../utils/error'
import { resolveCheckoutRedirectBase } from '../../../utils/origin'
import { CheckoutBodySchema } from '../schema'

export function createCheckoutOperation(
  payment: PaymentService,
  stripe: Stripe | null,
  priceCatalog: StripePriceCatalog | null,
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
    const fluxProductId = await configKV.getOptional('STRIPE_FLUX_PRODUCT_ID')
    if (!stripe || !priceCatalog || !fluxProductId)
      throw createServiceUnavailableError('Stripe is not configured', 'STRIPE_NOT_CONFIGURED')

    const parsed = safeParse(CheckoutBodySchema, body)
    if (!parsed.success)
      throw createBadRequestError('Invalid checkout request', 'INVALID_REQUEST', parsed.issues)

    const { stripePriceId, currency } = parsed.output
    const price = await priceCatalog.findActivePrice(fluxProductId, stripePriceId)
    if (!price)
      throw createBadRequestError('Invalid price', 'INVALID_PACKAGE', { stripePriceId })

    const fluxAmount = Number(price.metadata.fluxAmount)
    if (!Number.isFinite(fluxAmount) || fluxAmount <= 0)
      throw createBadRequestError('Price is missing fluxAmount metadata', 'INVALID_PACKAGE', { stripePriceId })

    const redirectBase = resolveCheckoutRedirectBase(request, env.ADDITIONAL_TRUSTED_ORIGINS, env.WEB_APP_URL)
    const openpanelIdentity = readOpenpanelIdentityHeaders(request)

    const order = await payment.openPending({
      userId: user.id,
      processor: 'stripe',
      packKey: stripePriceId,
      fluxAmount,
      currency,
    })

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      line_items: [{ price: stripePriceId, quantity: 1 }],
      mode: 'payment',
      allow_promotion_codes: true,
      success_url: `${redirectBase}/settings/flux?success=true`,
      cancel_url: `${redirectBase}/settings/flux?canceled=true`,
      customer: order.customerId,
      customer_email: order.customerId ? undefined : user.email,
      metadata: {
        payment_order_id: order.id,
        userId: user.id,
        stripePriceId,
        fluxAmount: String(fluxAmount),
        ...(openpanelIdentity.distinctId && { openpanelDeviceId: openpanelIdentity.distinctId }),
        ...(openpanelIdentity.sessionId && { openpanelSessionId: openpanelIdentity.sessionId }),
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
        stripe_price_id: stripePriceId,
        flux_amount: fluxAmount,
        amount_total: session.amount_total,
        currency: session.currency,
        ...(openpanelIdentity.distinctId && { openpanel_device_id: openpanelIdentity.distinctId }),
        ...(openpanelIdentity.sessionId && { openpanel_session_id: openpanelIdentity.sessionId }),
      },
    })

    return { url: session.url }
  }
}

function readOpenpanelIdentityHeaders(request: Request) {
  const distinctId = readStripeMetadataHeader(request, 'x-openpanel-device-id')
  const sessionId = readStripeMetadataHeader(request, 'x-openpanel-session-id')
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
