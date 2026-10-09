import type { Env } from '../../libs/env'
import type { RateLimitMetrics } from '../../otel'
import type { RevenuecatSubscriptionSync } from '../../services/adapters/revenuecat-subscriptions'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'

import { rateLimiter } from '../../middlewares/rate-limit'
import { createWebhookOperation } from './operations/webhook'

/** RevenueCat webhook ingress. Each event reconciles plan Flux from RevenueCat. */
export function createRevenuecatRoutes(
  subscriptionSync: RevenuecatSubscriptionSync,
  env: Pick<Env, 'REVENUECAT_WEBHOOK_AUTH' | 'REVENUECAT_WEBHOOK_SECRET'>,
  rateLimitMetrics?: RateLimitMetrics | null,
) {
  const webhook = createWebhookOperation(subscriptionSync, {
    authorization: env.REVENUECAT_WEBHOOK_AUTH ?? null,
    signingSecret: env.REVENUECAT_WEBHOOK_SECRET ?? null,
  })

  return new Hono<HonoEnv>()
    .post(
      '/webhook',
      rateLimiter({ max: 60, windowSec: 60, metrics: rateLimitMetrics, routeLabel: 'revenuecat.webhook' }),
      async (c) => {
        const rawBody = await c.req.text()
        return c.json(await webhook(rawBody, {
          authorization: c.req.header('authorization') ?? null,
          signature: c.req.header('x-revenuecat-webhook-signature') ?? null,
        }))
      },
    )
}
