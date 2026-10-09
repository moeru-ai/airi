import type { Env } from '../../libs/env'
import type { RateLimitMetrics } from '../../otel'
import type { ConfigKVService } from '../../services/adapters/config-kv'
import type { RevenuecatSubscriptionSync } from '../../services/adapters/revenuecat-subscriptions'
import type { PaymentService } from '../../services/domain/payment'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'

import { rateLimiter } from '../../middlewares/rate-limit'
import { createWebhookOperation } from './operations/webhook'

/**
 * RevenueCat webhook ingress for Flux packs and plan Flux.
 * A pack purchase maps onto Payment CORE `settle` as an evidence receipt.
 * Each other event reconciles plan Flux from RevenueCat.
 */
export function createRevenuecatRoutes(
  payment: PaymentService,
  configKV: ConfigKVService,
  subscriptionSync: RevenuecatSubscriptionSync,
  env: Pick<Env, 'REVENUECAT_WEBHOOK_AUTH' | 'REVENUECAT_WEBHOOK_SECRET'>,
  rateLimitMetrics?: RateLimitMetrics | null,
) {
  const webhook = createWebhookOperation(payment, configKV, subscriptionSync, {
    authorization: env.REVENUECAT_WEBHOOK_AUTH ?? null,
    signingSecret: env.REVENUECAT_WEBHOOK_SECRET ?? null,
  })

  return new Hono<HonoEnv>()
    .get('/packages', async (c) => {
      const packs = await configKV.getOptional('REVENUECAT_FLUX_PACKS') ?? {}
      return c.json(Object.entries(packs).map(([productId, pack]) => ({
        productId,
        fluxAmount: pack.fluxAmount,
      })))
    })
    .post(
      '/webhook',
      rateLimiter({ max: 60, windowSec: 60, metrics: rateLimitMetrics, routeLabel: 'revenuecat.webhook' }),
      async (c) => {
        const rawBody = await c.req.text()
        return c.json(await webhook(rawBody, {
          authorization: c.req.header('authorization') ?? null,
          signature: c.req.header('x-revenuecat-signature') ?? c.req.header('x-revenuecat-webhook-signature') ?? null,
        }))
      },
    )
}
