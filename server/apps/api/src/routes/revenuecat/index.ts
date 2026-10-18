import type { Database } from '../../libs/db'
import type { Env } from '../../libs/env'
import type { RateLimitMetrics } from '../../otel'
import type { ConfigKVService } from '../../services/adapters/config-kv'
import type { RevenuecatSubscriptionSync } from '../../services/adapters/revenuecat-subscriptions'
import type { PaymentService } from '../../services/domain/payment'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'

import { authGuard } from '../../middlewares/auth'
import { rateLimiter } from '../../middlewares/rate-limit'
import { createWebhookOperation } from './operations/webhook'

/**
 * RevenueCat webhook ingress for Flux packs and capacitor Flux.
 * A pack purchase maps onto Payment CORE `settle` as an evidence receipt.
 * Each other event reconciles capacitor Flux from RevenueCat.
 * `POST /sync` runs the same reconciliation for the caller. The client calls it after a purchase
 * and when the Capacitor page opens, so a late or lost webhook does not delay the grant.
 *
 * The webhook has no rate limit. An anonymous limit counts all callers behind the proxy as one,
 * so unsigned requests could use the budget and RevenueCat would get 429.
 * The operation rejects an unsigned request before it reads the database.
 */
export function createRevenuecatRoutes(
  payment: PaymentService,
  db: Database,
  configKV: ConfigKVService,
  subscriptionSync: RevenuecatSubscriptionSync,
  env: Pick<Env, 'REVENUECAT_WEBHOOK_AUTH' | 'REVENUECAT_WEBHOOK_SECRET' | 'REVENUECAT_ENVIRONMENT' | 'REVENUECAT_SANDBOX_USER_IDS'>,
  rateLimitMetrics: RateLimitMetrics | null,
) {
  const webhook = createWebhookOperation(payment, db, configKV, subscriptionSync, {
    authorization: env.REVENUECAT_WEBHOOK_AUTH ?? null,
    signingSecret: env.REVENUECAT_WEBHOOK_SECRET ?? null,
  }, {
    environment: env.REVENUECAT_ENVIRONMENT,
    sandboxUserIds: env.REVENUECAT_SANDBOX_USER_IDS,
  })

  return new Hono<HonoEnv>()
    .get('/packages', async (c) => {
      const packs = await configKV.getOptional('REVENUECAT_FLUX_PACKS') ?? {}
      return c.json(Object.entries(packs).map(([productId, pack]) => ({
        productId,
        fluxAmount: pack.fluxAmount,
      })))
    })
    .post('/webhook', async (c) => {
      const rawBody = await c.req.text()
      return c.json(await webhook(rawBody, {
        authorization: c.req.header('authorization') ?? null,
        signature: c.req.header('x-revenuecat-webhook-signature') ?? null,
      }))
    })
    // Each sync reads RevenueCat one time. The limit protects the RevenueCat API quota.
    .post('/sync', authGuard, rateLimiter({ max: 10, windowSec: 60, metrics: rateLimitMetrics, routeLabel: 'revenuecat.sync' }), async (c) => {
      await subscriptionSync.reconcile(c.get('user')!.id)
      return c.json({ synced: true })
    })
    .get('/capacitors', authGuard, async c => c.json({ productIds: await subscriptionSync.listProductIds() }))
    .get('/catalog', authGuard, async c => c.json(await subscriptionSync.listCapacitors()))
}
