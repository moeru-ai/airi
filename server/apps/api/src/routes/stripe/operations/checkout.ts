import type Stripe from 'stripe'

import type { Database } from '../../../libs/db'
import type { Env } from '../../../libs/env'
import type { RevenueMetrics } from '../../../otel'
import type { ConfigKVService } from '../../../services/adapters/config-kv'
import type { FluxPack } from '../../../services/domain/payment'
import type { ProductEventService } from '../../../services/domain/product-events'

import { and, eq, isNull } from 'drizzle-orm'
import { safeParse } from 'valibot'

import { loadFluxPacks } from '../../../services/domain/payment'
import { createBadRequestError, createInternalError, createServiceUnavailableError } from '../../../utils/error'
import { resolveCheckoutRedirectBase } from '../../../utils/origin'
import { CheckoutBodySchema } from '../schema'

import * as schema from '../../../schemas/payment'

/**
 * Inserts a pending `payment_order`, then creates a Stripe Checkout Session.
 *
 * `{ packKey }` and legacy `{ stripePriceId }` resolve a Flux pack.
 */
export function createCheckoutOperation(
  db: Database,
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

    const { packKey, stripePriceId, currency } = parsed.output

    const packs = await loadFluxPacks(configKV)
    const pack = resolveCheckoutPack(packs, packKey, stripePriceId)
    if (!pack)
      throw createBadRequestError('Invalid pack', 'INVALID_PACKAGE', { packKey })

    const redirectBase = resolveCheckoutRedirectBase(request, env.ADDITIONAL_TRUSTED_ORIGINS, env.WEB_APP_URL)
    const posthogIdentity = readPosthogIdentityHeaders(request)

    const [order] = await db.insert(schema.paymentOrder).values({
      userId: user.id,
      provider: 'stripe',
      status: 'pending',
      packKey: pack.key,
      fluxAmount: pack.fluxAmount,
      currency,
    }).returning()

    if (!order)
      throw createInternalError('Failed to create payment order')

    const [account] = await db
      .select({ providerCustomerId: schema.providerAccount.providerCustomerId })
      .from(schema.providerAccount)
      .where(and(
        eq(schema.providerAccount.userId, user.id),
        eq(schema.providerAccount.provider, 'stripe'),
        isNull(schema.providerAccount.deletedAt),
      ))
      .limit(1)

    const priceId = pack.providers.stripe?.priceId
    if (!priceId)
      throw createServiceUnavailableError('Stripe pack mapping is missing', 'STRIPE_PACK_NOT_MAPPED', { packKey: pack.key })

    const paymentMethods = await configKV.getOptional('STRIPE_PAYMENT_METHODS')
    const paymentMethodOptions = await configKV.getOptional('STRIPE_PAYMENT_METHOD_OPTIONS') ?? {}
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'payment',
      allow_promotion_codes: true,
      success_url: `${redirectBase}/settings/flux?success=true`,
      cancel_url: `${redirectBase}/settings/flux?canceled=true`,
      customer: account?.providerCustomerId ?? undefined,
      customer_email: account?.providerCustomerId ? undefined : user.email,
      metadata: {
        payment_order_id: order.id,
        userId: user.id,
        packKey: pack.key,
        fluxAmount: String(pack.fluxAmount),
        ...(posthogIdentity.distinctId && { posthogDistinctId: posthogIdentity.distinctId }),
        ...(posthogIdentity.sessionId && { posthogSessionId: posthogIdentity.sessionId }),
      },
    }

    if (paymentMethods)
      sessionParams.payment_method_types = paymentMethods as Stripe.Checkout.SessionCreateParams['payment_method_types']

    if (Object.keys(paymentMethodOptions).length > 0)
      sessionParams.payment_method_options = paymentMethodOptions as Stripe.Checkout.SessionCreateParams['payment_method_options']

    if (currency)
      sessionParams.currency = currency

    const session = await stripe.checkout.sessions.create(sessionParams)
    if (!session.url)
      throw createServiceUnavailableError('Stripe checkout did not return a URL', 'STRIPE_CHECKOUT_URL_MISSING')

    await db.update(schema.paymentOrder)
      .set({
        providerOrderId: session.id,
        amount: session.amount_total ?? undefined,
        currency: session.currency ?? currency,
        updatedAt: new Date(),
      })
      .where(and(
        eq(schema.paymentOrder.id, order.id),
        isNull(schema.paymentOrder.providerOrderId),
      ))

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

function resolveCheckoutPack(packs: FluxPack[], packKey: string | undefined, stripePriceId: string | undefined) {
  if (packKey)
    return packs.find(pack => pack.key === packKey)
  if (stripePriceId)
    return packs.find(pack => pack.providers.stripe?.priceId === stripePriceId)
  return undefined
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
