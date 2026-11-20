import type { Database } from '../../libs/db'
import type { Env } from '../../libs/env'
import type { RateLimitMetrics } from '../../otel'
import type { AccountEventPublisher } from '../../services/adapters/account-events'
import type { ConfigKVService } from '../../services/adapters/config-kv'
import type { RevenuecatSubscriberClient } from '../../services/adapters/revenuecat-subscriber'
import type { RevenuecatSubscriptionSync } from '../../services/adapters/revenuecat-subscriptions'
import type { PaymentService } from '../../services/domain/payment'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'

import { authGuard } from '../../middlewares/auth'
import { rateLimiter } from '../../middlewares/rate-limit'
import { createWebhookOperation } from './operations/webhook'

/**
 * RevenueCat routes reconcile subscriptions and settle configured pack receipts.
 * Renewal and billing-issue notifications publish after reconciliation.
 * `POST /sync` reconciles signed-in users.
 * The webhook authenticates requests before database access.
 * Anonymous rate limits can block RevenueCat behind a shared proxy.
 */
export function createRevenuecatRoutes(
  payment: PaymentService,
  db: Database,
  configKV: ConfigKVService,
  subscriptionSync: RevenuecatSubscriptionSync,
  accountEvents: Pick<AccountEventPublisher, 'publish'>,
  subscriber: Pick<RevenuecatSubscriberClient, 'countsFor'>,
  env: Pick<Env, 'REVENUECAT_WEBHOOK_AUTH' | 'REVENUECAT_WEBHOOK_SECRET'>,
  rateLimitMetrics: RateLimitMetrics | null,
) {
  const webhook = createWebhookOperation(payment, db, configKV, subscriptionSync, accountEvents, subscriber, {
    authorization: env.REVENUECAT_WEBHOOK_AUTH ?? null,
    signingSecret: env.REVENUECAT_WEBHOOK_SECRET ?? null,
  })

  return new Hono<HonoEnv>()
    .get('/packages', async (c) => {
      const packs = await configKV.getOptional('REVENUECAT_FLUX_PACKS') ?? {}
      return c.json({ records: Object.entries(packs).map(([productId, pack]) => ({
        productId,
        fluxAmount: pack.fluxAmount,
      })) })
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
