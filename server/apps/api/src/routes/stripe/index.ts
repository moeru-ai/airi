import type Redis from 'ioredis'
import type Stripe from 'stripe'

import type { Env } from '../../libs/env'
import type { RateLimitMetrics, RevenueMetrics } from '../../otel'
import type { ConfigKVService } from '../../services/adapters/config-kv'
import type { PaymentService } from '../../services/domain/payment'
import type { ProductEventService } from '../../services/domain/product-events'
import type { HonoEnv } from '../../types/hono'

import { ok } from '@proj-airi/http-shared'
import { Hono } from 'hono'

import { authGuard } from '../../middlewares/auth'
import { rateLimiter } from '../../middlewares/rate-limit'
import { createCheckoutOperation } from './operations/checkout'
import { createWebhookOperation } from './operations/webhook'
import { createStripePriceCatalog, listStripePackages } from './price-catalog'

export function createStripeRoutes(
  payment: PaymentService,
  stripe: Stripe | null,
  redis: Redis,
  configKV: ConfigKVService,
  env: Env,
  metrics: RevenueMetrics | null,
  rateLimitMetrics: RateLimitMetrics | null,
  productEventService: ProductEventService | null,
) {
  const priceCatalog = stripe ? createStripePriceCatalog(stripe, redis) : null
  const checkout = createCheckoutOperation(payment, stripe, priceCatalog, configKV, env, metrics, productEventService)
  const webhook = createWebhookOperation(stripe, env.STRIPE_WEBHOOK_SECRET ?? null, payment, metrics, productEventService)

  return new Hono<HonoEnv>()
    .get('/packages', async (c) => {
      const fluxProductId = await configKV.getOptional('STRIPE_FLUX_PRODUCT_ID')
      if (!priceCatalog || !fluxProductId)
        // eslint-disable-next-line no-restricted-syntax -- Known deviation in 2026-10-19-http-response-conventions.md: clients read a bare array.
        return c.json([])
      // eslint-disable-next-line no-restricted-syntax -- Known deviation in 2026-10-19-http-response-conventions.md: clients read a bare array.
      return c.json(await listStripePackages(priceCatalog, fluxProductId))
    })
    .post('/checkout', authGuard, rateLimiter({ max: 10, windowSec: 60, metrics: rateLimitMetrics, routeLabel: 'stripe.checkout' }), async (c) => {
      const body = await c.req.json()
      return ok(c, await checkout(c.get('user')!, body, c.req.raw))
    })
    .post('/webhook', async (c) => {
      const signature = c.req.header('stripe-signature') ?? null
      const body = signature ? await c.req.text() : ''
      // eslint-disable-next-line no-restricted-syntax -- Stripe owns the webhook response.
      return c.json(await webhook(signature, body))
    })
}
