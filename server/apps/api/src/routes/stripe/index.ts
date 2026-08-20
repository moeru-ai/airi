import type Redis from 'ioredis'
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
import { createCheckoutOperation } from './operations/checkout'
import { createWebhookOperation } from './operations/webhook'
import { listStripePackages, loadFluxPacks } from './price-catalog'

/**
 * Creates Stripe HTTP routes for Flux purchase.
 *
 * Paths stay on `/api/v1/stripe`. Checkout lives in this channel.
 * Webhook dispatch maps a session onto Payment CORE `settle`.
 */
export function createStripeRoutes(
  payment: PaymentService,
  db: Database,
  stripe: Stripe | null,
  redis: Redis,
  configKV: ConfigKVService,
  env: Env,
  metrics: RevenueMetrics | null,
  rateLimitMetrics: RateLimitMetrics | null,
  productEventService: ProductEventService | null,
) {
  const checkout = createCheckoutOperation(db, stripe, configKV, env, metrics, productEventService)
  const webhook = createWebhookOperation(stripe, env.STRIPE_WEBHOOK_SECRET ?? null, payment, metrics, productEventService)

  return new Hono<HonoEnv>()
    .get('/packages', async (c) => {
      const packs = await loadFluxPacks(configKV)
      return c.json(await listStripePackages(stripe, redis, packs))
    })
    .post('/checkout', authGuard, rateLimiter({ max: 10, windowSec: 60, metrics: rateLimitMetrics, routeLabel: 'stripe.checkout' }), async (c) => {
      const body = await c.req.json()
      return c.json(await checkout(c.get('user')!, body, c.req.raw))
    })
    .post('/webhook', async (c) => {
      const signature = c.req.header('stripe-signature') ?? null
      const body = signature ? await c.req.text() : ''
      return c.json(await webhook(signature, body))
    })
}
