import type { Env } from '../../libs/env'
import type { RevenuecatSubscriptionSync } from '../../services/adapters/revenuecat-subscriptions'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'

import { createWebhookOperation } from './operations/webhook'

/**
 * RevenueCat webhook ingress. Each event reconciles capacitor Flux from RevenueCat.
 *
 * The route has no rate limit. An anonymous limit counts all callers behind the proxy as one,
 * so unsigned requests could use the budget and RevenueCat would get 429.
 * The operation rejects an unsigned request before it reads the database.
 */
export function createRevenuecatRoutes(
  subscriptionSync: RevenuecatSubscriptionSync,
  env: Pick<Env, 'REVENUECAT_WEBHOOK_AUTH' | 'REVENUECAT_WEBHOOK_SECRET'>,
) {
  const webhook = createWebhookOperation(subscriptionSync, {
    authorization: env.REVENUECAT_WEBHOOK_AUTH ?? null,
    signingSecret: env.REVENUECAT_WEBHOOK_SECRET ?? null,
  })

  return new Hono<HonoEnv>()
    .post('/webhook', async (c) => {
      const rawBody = await c.req.text()
      return c.json(await webhook(rawBody, {
        authorization: c.req.header('authorization') ?? null,
        signature: c.req.header('x-revenuecat-webhook-signature') ?? null,
      }))
    })
}
