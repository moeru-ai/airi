import type { Env } from '../../../libs/env'
import type { RevenueMetrics } from '../../../otel'
import type { PaymentService } from '../../../services/domain/payment'
import type { ProductEventService } from '../../../services/domain/product-events'
import type { HonoEnv } from '../../../types/hono'

import { safeParse } from 'valibot'

import { createBadRequestError } from '../../../utils/error'
import { resolveCheckoutRedirectBase } from '../../../utils/origin'
import { CheckoutBodySchema } from '../schema'

type AuthenticatedUser = NonNullable<HonoEnv['Variables']['user']>

export interface CheckoutOperationDeps {
  payment: PaymentService
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
 * Dispatches Stripe checkout onto Payment CORE.
 *
 * `{ packKey }` and legacy `{ stripePriceId }` call `startPack`.
 * `{ planKey }` is rejected until Phase 2.
 */
export function createCheckoutOperation(deps: CheckoutOperationDeps) {
  return async (input: CheckoutOperationInput): Promise<{ url: string }> => {
    const parsed = safeParse(CheckoutBodySchema, input.body)
    if (!parsed.success)
      throw createBadRequestError('Invalid checkout request', 'INVALID_REQUEST', parsed.issues)

    const { packKey, planKey, stripePriceId, currency } = parsed.output
    if (planKey)
      throw createBadRequestError('Subscription checkout is not available', 'PLAN_CHECKOUT_UNAVAILABLE')

    const resolvedPackKey = packKey ?? await deps.payment.resolvePackKeyFromStripePriceId(stripePriceId!)

    const redirectBase = resolveCheckoutRedirectBase(input.request, deps.env.ADDITIONAL_TRUSTED_ORIGINS, deps.env.WEB_APP_URL)
    const posthogIdentity = readPosthogIdentityHeaders(input.request)

    const result = await deps.payment.startPack({
      userId: input.user.id,
      provider: 'stripe',
      packKey: resolvedPackKey,
      startContext: {
        currency,
        successUrl: `${redirectBase}/settings/flux?success=true`,
        cancelUrl: `${redirectBase}/settings/flux?canceled=true`,
        customerEmail: input.user.email,
        metadata: {
          ...(posthogIdentity.distinctId && { posthogDistinctId: posthogIdentity.distinctId }),
          ...(posthogIdentity.sessionId && { posthogSessionId: posthogIdentity.sessionId }),
        },
      },
    })

    deps.metrics?.stripeCheckoutCreated.add(1)
    void deps.productEventService?.track({
      userId: input.user.id,
      feature: 'billing',
      action: 'checkout_started',
      status: 'succeeded',
      eventId: session.id,
      source: 'stripe.checkout',
      metadata: {
        pack_key: resolvedPackKey,
        ...(posthogIdentity.distinctId && { posthog_distinct_id: posthogIdentity.distinctId }),
        ...(posthogIdentity.sessionId && { posthog_session_id: posthogIdentity.sessionId }),
      },
    })

    return { url: result.url }
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
