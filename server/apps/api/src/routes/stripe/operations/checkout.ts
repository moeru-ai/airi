import type Stripe from 'stripe'

import type { Database } from '../../../libs/db'
import type { Env } from '../../../libs/env'
import type { RevenueMetrics } from '../../../otel'
import type { ConfigKVService } from '../../../services/adapters/config-kv'
import type { FluxPack } from '../../../services/domain/payment'
import type { ProductEventService } from '../../../services/domain/product-events'
import type { HonoEnv } from '../../../types/hono'

import { and, eq, isNull } from 'drizzle-orm'
import { safeParse } from 'valibot'

import { createBadRequestError, createInternalError, createServiceUnavailableError } from '../../../utils/error'
import { resolveCheckoutRedirectBase } from '../../../utils/origin'
import { findFluxPackByKey, findFluxPackByStripePriceId, loadFluxPacks } from '../catalog'
import { CheckoutBodySchema } from '../schema'

import * as schema from '../../../schemas/payment'

type AuthenticatedUser = NonNullable<HonoEnv['Variables']['user']>
type CheckoutSessionCreateParams = NonNullable<Parameters<Stripe['checkout']['sessions']['create']>[0]>

export interface CheckoutOperationDeps {
  db: Database
  stripe: Stripe | null
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
 * Inserts a pending `payment_order`, then creates a Stripe Checkout Session.
 *
 * `{ packKey }` and legacy `{ stripePriceId }` resolve a Flux pack.
 */
export function createCheckoutOperation(deps: CheckoutOperationDeps) {
  return async (input: CheckoutOperationInput): Promise<{ url: string }> => {
    if (!deps.stripe)
      throw createServiceUnavailableError('Stripe is not configured', 'STRIPE_NOT_CONFIGURED')

    const parsed = safeParse(CheckoutBodySchema, input.body)
    if (!parsed.success)
      throw createBadRequestError('Invalid checkout request', 'INVALID_REQUEST', parsed.issues)

    const { packKey, stripePriceId, currency } = parsed.output

    const packs = await loadFluxPacks(deps.configKV)
    const pack = resolveCheckoutPack(packs, packKey, stripePriceId)
    if (!pack) {
      throw createBadRequestError(
        packKey ? 'Invalid pack' : 'Invalid price',
        'INVALID_PACKAGE',
        packKey ? { packKey } : { stripePriceId },
      )
    }

    const redirectBase = resolveCheckoutRedirectBase(input.request, deps.env.ADDITIONAL_TRUSTED_ORIGINS, deps.env.WEB_APP_URL)
    const posthogIdentity = readPosthogIdentityHeaders(input.request)

    const [order] = await deps.db.insert(schema.paymentOrder).values({
      userId: input.user.id,
      provider: 'stripe',
      status: 'pending',
      packKey: pack.key,
      fluxAmount: pack.fluxAmount,
      currency,
    }).returning()

    if (!order)
      throw createInternalError('Failed to create payment order')

    const [account] = await deps.db
      .select({ providerCustomerId: schema.providerAccount.providerCustomerId })
      .from(schema.providerAccount)
      .where(and(
        eq(schema.providerAccount.userId, input.user.id),
        eq(schema.providerAccount.provider, 'stripe'),
        isNull(schema.providerAccount.deletedAt),
      ))
      .limit(1)

    const created = await createCheckoutSession(deps.stripe, deps.configKV, {
      paymentOrderId: order.id,
      userId: input.user.id,
      pack,
      currency,
      successUrl: `${redirectBase}/settings/flux?success=true`,
      cancelUrl: `${redirectBase}/settings/flux?canceled=true`,
      customerEmail: input.user.email,
      providerCustomerId: account?.providerCustomerId ?? null,
      metadata: {
        ...(posthogIdentity.distinctId && { posthogDistinctId: posthogIdentity.distinctId }),
        ...(posthogIdentity.sessionId && { posthogSessionId: posthogIdentity.sessionId }),
      },
    })

    await deps.db.update(schema.paymentOrder)
      .set({
        providerOrderId: created.providerOrderId,
        amount: created.amount,
        currency: created.currency ?? currency,
        updatedAt: new Date(),
      })
      .where(and(
        eq(schema.paymentOrder.id, order.id),
        isNull(schema.paymentOrder.providerOrderId),
      ))

    deps.metrics?.stripeCheckoutCreated.add(1)
    void deps.productEventService?.track({
      userId: input.user.id,
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

    return { url: created.url }
  }
}

function resolveCheckoutPack(
  packs: FluxPack[],
  packKey: string | undefined,
  stripePriceId: string | undefined,
): FluxPack | undefined {
  if (packKey)
    return findFluxPackByKey(packs, packKey)
  if (stripePriceId)
    return findFluxPackByStripePriceId(packs, stripePriceId)
  return undefined
}

async function createCheckoutSession(
  stripe: Stripe,
  configKV: ConfigKVService,
  input: {
    paymentOrderId: string
    userId: string
    pack: FluxPack
    currency?: string
    successUrl: string
    cancelUrl: string
    customerEmail?: string
    providerCustomerId?: string | null
    metadata?: Record<string, string>
  },
): Promise<{ providerOrderId: string, url: string, amount?: number, currency?: string }> {
  const priceId = input.pack.providers.stripe?.priceId
  if (!priceId)
    throw createServiceUnavailableError('Stripe pack mapping is missing', 'STRIPE_PACK_NOT_MAPPED', { packKey: input.pack.key })

  const paymentMethods = await configKV.getOptional('STRIPE_PAYMENT_METHODS')
  const paymentMethodOptions = await configKV.getOptional('STRIPE_PAYMENT_METHOD_OPTIONS') ?? {}

  const sessionParams: CheckoutSessionCreateParams = {
    line_items: [{ price: priceId, quantity: 1 }],
    mode: 'payment',
    allow_promotion_codes: true,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    customer: input.providerCustomerId ?? undefined,
    customer_email: input.providerCustomerId ? undefined : input.customerEmail,
    metadata: {
      payment_order_id: input.paymentOrderId,
      userId: input.userId,
      packKey: input.pack.key,
      fluxAmount: String(input.pack.fluxAmount),
      ...input.metadata,
    },
  }

  if (paymentMethods)
    sessionParams.payment_method_types = paymentMethods as CheckoutSessionCreateParams['payment_method_types']

  if (Object.keys(paymentMethodOptions).length > 0)
    sessionParams.payment_method_options = paymentMethodOptions as CheckoutSessionCreateParams['payment_method_options']

  if (input.currency)
    sessionParams.currency = input.currency

  const session = await stripe.checkout.sessions.create(sessionParams)
  if (!session.url)
    throw createServiceUnavailableError('Stripe checkout did not return a URL', 'STRIPE_CHECKOUT_URL_MISSING')

  return {
    providerOrderId: session.id,
    url: session.url,
    amount: session.amount_total ?? undefined,
    currency: session.currency ?? undefined,
  }
}

function readPosthogIdentityHeaders(request: Request): { distinctId?: string, sessionId?: string } {
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

  return value.slice(0, 200)
}
