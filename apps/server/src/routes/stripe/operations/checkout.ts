import type Stripe from 'stripe'

import type { Env } from '../../../libs/env'
import type { RevenueMetrics } from '../../../otel'
import type { ConfigKVService } from '../../../services/adapters/config-kv'
import type { ProductEventService } from '../../../services/domain/product-events'
import type { StripeService } from '../../../services/domain/stripe'
import type { HonoEnv } from '../../../types/hono'
import type { StripePriceCatalog } from '../price-catalog'

import { safeParse } from 'valibot'

import { createBadRequestError, createServiceUnavailableError } from '../../../utils/error'
import { resolveCheckoutRedirectBase } from '../../../utils/origin'
import { CheckoutBodySchema } from '../schema'

type AuthenticatedUser = NonNullable<HonoEnv['Variables']['user']>
type CheckoutSessionCreateParams = NonNullable<Parameters<Stripe['checkout']['sessions']['create']>[0]>

export interface CheckoutOperationDeps {
  stripe: Stripe | null
  priceCatalog: StripePriceCatalog | null
  stripeService: StripeService
  configKV: ConfigKVService
  env: Env
  metrics?: RevenueMetrics | null
  productEventService?: ProductEventService
}

export interface CheckoutOperationInput {
  user: AuthenticatedUser
  body: unknown
  request: Request
}

/**
 * Creates Stripe checkout sessions for Flux packages.
 *
 * Use when:
 * - A signed-in user starts a one-time Flux purchase.
 * - The route already enforced auth and rate limiting.
 *
 * Expects:
 * - ConfigKV has `STRIPE_FLUX_PRODUCT_ID`.
 * - `body` matches {@link CheckoutBodySchema}.
 *
 * Returns:
 * - A Stripe-hosted checkout URL.
 */
export function createCheckoutOperation(deps: CheckoutOperationDeps) {
  return async (input: CheckoutOperationInput): Promise<{ url: string | null }> => {
    const fluxProductId = await deps.configKV.getOptional('STRIPE_FLUX_PRODUCT_ID')
    if (!deps.stripe || !deps.priceCatalog || !fluxProductId)
      throw createServiceUnavailableError('Stripe is not configured', 'STRIPE_NOT_CONFIGURED')

    const result = safeParse(CheckoutBodySchema, input.body)
    if (!result.success)
      throw createBadRequestError('Invalid checkout request', 'INVALID_REQUEST', result.issues)

    const { stripePriceId, currency } = result.output

    const price = await deps.priceCatalog.findActivePrice(fluxProductId, stripePriceId)
    if (!price)
      throw createBadRequestError('Invalid price', 'INVALID_PACKAGE', { stripePriceId })

    const fluxAmount = Number(price.metadata.fluxAmount)
    if (!Number.isFinite(fluxAmount) || fluxAmount <= 0)
      throw createBadRequestError('Price is missing fluxAmount metadata', 'INVALID_PACKAGE', { stripePriceId })

    // Reuse existing stripe customer if available.
    const customer = await deps.stripeService.getCustomerByUserId(input.user.id)
    const stripeCustomerId = customer?.stripeCustomerId

    const redirectBase = resolveCheckoutRedirectBase(input.request, deps.env.ADDITIONAL_TRUSTED_ORIGINS, deps.env.WEB_APP_URL)

    const paymentMethods = await deps.configKV.getOptional('STRIPE_PAYMENT_METHODS')
    const paymentMethodOptions = await deps.configKV.getOptional('STRIPE_PAYMENT_METHOD_OPTIONS') ?? {}

    const sessionParams: CheckoutSessionCreateParams = {
      line_items: [{ price: stripePriceId, quantity: 1 }],
      mode: 'payment',
      allow_promotion_codes: true,
      success_url: `${redirectBase}/settings/flux?success=true`,
      cancel_url: `${redirectBase}/settings/flux?canceled=true`,
      customer: stripeCustomerId,
      customer_email: stripeCustomerId ? undefined : input.user.email,
      metadata: {
        userId: input.user.id,
        fluxAmount: String(fluxAmount),
      },
    }

    // When STRIPE_PAYMENT_METHODS is not set, omit payment_method_types to let Stripe
    // automatically determine available methods based on currency and Dashboard settings.
    if (paymentMethods)
      sessionParams.payment_method_types = paymentMethods as CheckoutSessionCreateParams['payment_method_types']

    if (Object.keys(paymentMethodOptions).length > 0)
      sessionParams.payment_method_options = paymentMethodOptions as CheckoutSessionCreateParams['payment_method_options']

    // When currency is specified, Stripe uses the matching currency_options on the Price.
    if (currency)
      sessionParams.currency = currency

    const session = await deps.stripe.checkout.sessions.create(sessionParams)

    // Persist the checkout session.
    await deps.stripeService.upsertCheckoutSession({
      userId: input.user.id,
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

    deps.metrics?.stripeCheckoutCreated.add(1)
    void deps.productEventService?.track({
      userId: input.user.id,
      feature: 'billing',
      action: 'checkout_started',
      status: 'succeeded',
      source: 'stripe.checkout',
      metadata: {
        flux_amount: fluxAmount,
        amount_total: session.amount_total,
        currency: session.currency,
      },
    })

    return { url: session.url }
  }
}
