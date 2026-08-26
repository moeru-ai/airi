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

export interface CheckoutOperationDeps {
  configKV: ConfigKVService
  env: Env
  metrics?: null | RevenueMetrics
  priceCatalog: null | StripePriceCatalog
  productEventService?: ProductEventService
  stripe: null | Stripe
  stripeService: StripeService
}
export interface CheckoutOperationInput {
  body: unknown
  request: Request
  user: AuthenticatedUser
}

type AuthenticatedUser = NonNullable<HonoEnv['Variables']['user']>

type CheckoutSessionCreateParams = NonNullable<Parameters<Stripe['checkout']['sessions']['create']>[0]>

interface PosthogIdentityHeaders {
  distinctId?: string
  sessionId?: string
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
  return async (input: CheckoutOperationInput): Promise<{ url: null | string }> => {
    const fluxProductId = await deps.configKV.getOptional('STRIPE_FLUX_PRODUCT_ID')
    if (!deps.stripe || !deps.priceCatalog || !fluxProductId)
      throw createServiceUnavailableError('Stripe is not configured', 'STRIPE_NOT_CONFIGURED')

    const result = safeParse(CheckoutBodySchema, input.body)
    if (!result.success)
      throw createBadRequestError('Invalid checkout request', 'INVALID_REQUEST', result.issues)

    const { currency, stripePriceId } = result.output

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
    const posthogIdentity = readPosthogIdentityHeaders(input.request)

    const sessionParams: CheckoutSessionCreateParams = {
      allow_promotion_codes: true,
      cancel_url: `${redirectBase}/settings/flux?canceled=true`,
      customer: stripeCustomerId,
      customer_email: stripeCustomerId ? undefined : input.user.email,
      line_items: [{ price: stripePriceId, quantity: 1 }],
      metadata: {
        fluxAmount: String(fluxAmount),
        userId: input.user.id,
        ...(posthogIdentity.distinctId && { posthogDistinctId: posthogIdentity.distinctId }),
        ...(posthogIdentity.sessionId && { posthogSessionId: posthogIdentity.sessionId }),
      },
      mode: 'payment',
      success_url: `${redirectBase}/settings/flux?success=true`,
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
      userId: input.user.id,
    })

    deps.metrics?.stripeCheckoutCreated.add(1)
    void deps.productEventService?.track({
      action: 'checkout_started',
      eventId: session.id,
      feature: 'billing',
      metadata: {
        amount_total: session.amount_total,
        currency: session.currency,
        flux_amount: fluxAmount,
        ...(posthogIdentity.distinctId && { posthog_distinct_id: posthogIdentity.distinctId }),
        ...(posthogIdentity.sessionId && { posthog_session_id: posthogIdentity.sessionId }),
      },
      source: 'stripe.checkout',
      status: 'succeeded',
      userId: input.user.id,
    })

    return { url: session.url }
  }
}

function readPosthogIdentityHeaders(request: Request): PosthogIdentityHeaders {
  const distinctId = readStripeMetadataHeader(request, 'x-posthog-distinct-id')
  const sessionId = readStripeMetadataHeader(request, 'x-posthog-session-id')
  return {
    ...(distinctId && { distinctId }),
    ...(sessionId && { sessionId }),
  }
}

function readStripeMetadataHeader(request: Request, name: string): string | undefined {
  const value = request.headers.get(name)?.trim()
  if (!value)
    return undefined

  // Stripe metadata values are capped and user-controlled headers can be
  // oversized. Truncating keeps the checkout request valid without turning
  // analytics identity into a payment blocker.
  return value.slice(0, 200)
}
