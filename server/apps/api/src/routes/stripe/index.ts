import type Stripe from 'stripe'

import type { Env } from '../../libs/env'
import type { RateLimitMetrics, RevenueMetrics } from '../../otel'
import type { PaymentProvider, PaymentService } from '../../services/domain/payment'
import type { ProductEventService } from '../../services/domain/product-events'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'

import { authGuard } from '../../middlewares/auth'
import { rateLimiter } from '../../middlewares/rate-limit'
import { createBadRequestError, createServiceUnavailableError } from '../../utils/error'
import { resolveCheckoutRedirectBase } from '../../utils/origin'
import { createCheckoutOperation } from './operations/checkout'
import { createWebhookOperation } from './operations/webhook'

export interface StripeRouteDeps {
  payment: PaymentService
  stripeAdapter: PaymentProvider
  stripe: Stripe | null
  env: Env
  metrics?: RevenueMetrics | null
  rateLimitMetrics?: RateLimitMetrics | null
  productEventService?: ProductEventService
}

/**
 * Creates Stripe HTTP routes for Flux purchase.
 *
 * Paths stay on `/api/v1/stripe`. Checkout and webhook dispatch into Payment CORE.
 */
export function createStripeRoutes(deps: StripeRouteDeps) {
  const checkout = createCheckoutOperation({
    payment: deps.payment,
    env: deps.env,
    metrics: deps.metrics,
    productEventService: deps.productEventService,
  })
  const webhook = createWebhookOperation({
    stripe: deps.stripe,
    webhookSecret: deps.env.STRIPE_WEBHOOK_SECRET,
    stripeAdapter: deps.stripeAdapter,
    payment: deps.payment,
    metrics: deps.metrics,
    productEventService: deps.productEventService,
  })

  return new Hono<HonoEnv>()
    .get('/packages', async (c) => {
      return c.json(await deps.payment.listPacks('stripe'))
    })
    .post('/checkout', authGuard, rateLimiter({ max: 10, windowSec: 60, metrics: deps.rateLimitMetrics, routeLabel: 'stripe.checkout' }), async (c) => {
      const body = await c.req.json()
      return c.json(await checkout({
        user: c.get('user')!,
        body,
        request: c.req.raw,
      }))
    })
    .post('/portal', authGuard, async (c) => {
      if (!deps.stripe)
        throw createServiceUnavailableError('Stripe is not configured', 'STRIPE_NOT_CONFIGURED')

      const user = c.get('user')!
      const account = await deps.payment.getProviderAccount({ userId: user.id, provider: 'stripe' })
      if (!account)
        throw createBadRequestError('No billing account found', 'NO_CUSTOMER')

      const portalReturnBase = resolveCheckoutRedirectBase(c.req.raw, deps.env.ADDITIONAL_TRUSTED_ORIGINS, deps.env.WEB_APP_URL)

      const portalSession = await deps.stripe.billingPortal.sessions.create({
        customer: account.providerCustomerId,
        return_url: `${portalReturnBase}/settings/flux`,
      })

      return c.json({ url: portalSession.url })
    })
    .post('/webhook', async (c) => {
      const signature = c.req.header('stripe-signature') ?? null
      const body = signature ? await c.req.text() : ''
      return c.json(await webhook({ signature, body }))
    })
}
