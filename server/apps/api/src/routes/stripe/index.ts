import type Stripe from 'stripe'

import type { Database } from '../../libs/db'
import type { Env } from '../../libs/env'
import type { RateLimitMetrics, RevenueMetrics } from '../../otel'
import type { ConfigKVService } from '../../services/adapters/config-kv'
import type { PaymentService } from '../../services/domain/payment'
import type { ProductEventService } from '../../services/domain/product-events'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'

import { authGuard } from '../../middlewares/auth'
import { rateLimiter } from '../../middlewares/rate-limit'
import { listStripePackages, loadFluxPacks } from './catalog'
import { createCheckoutOperation } from './operations/checkout'
import { createWebhookOperation } from './operations/webhook'

export interface StripeRouteDeps {
  payment: PaymentService
  db: Database
  stripe: Stripe | null
  configKV: ConfigKVService
  env: Env
  metrics?: RevenueMetrics | null
  rateLimitMetrics?: RateLimitMetrics | null
  productEventService?: ProductEventService
}

/**
 * Creates Stripe HTTP routes for Flux purchase.
 *
 * Paths stay on `/api/v1/stripe`. Checkout lives in this channel.
 * Webhook dispatch maps a session onto Payment CORE `settle`.
 */
export function createStripeRoutes(deps: StripeRouteDeps) {
  const checkout = createCheckoutOperation({
    db: deps.db,
    stripe: deps.stripe,
    configKV: deps.configKV,
    env: deps.env,
    metrics: deps.metrics,
    productEventService: deps.productEventService,
  })
  const webhook = createWebhookOperation({
    stripe: deps.stripe,
    webhookSecret: deps.env.STRIPE_WEBHOOK_SECRET,
    payment: deps.payment,
    metrics: deps.metrics,
    productEventService: deps.productEventService,
  })

  return new Hono<HonoEnv>()
    .get('/packages', async (c) => {
      const packs = await loadFluxPacks(deps.configKV)
      return c.json(await listStripePackages(deps.stripe, packs))
    })
    .post('/checkout', authGuard, rateLimiter({ max: 10, windowSec: 60, metrics: deps.rateLimitMetrics, routeLabel: 'stripe.checkout' }), async (c) => {
      const body = await c.req.json()
      return c.json(await checkout({
        user: c.get('user')!,
        body,
        request: c.req.raw,
      }))
    })
    .post('/webhook', async (c) => {
      const signature = c.req.header('stripe-signature') ?? null
      const body = signature ? await c.req.text() : ''
      return c.json(await webhook({ signature, body }))
    })
}
