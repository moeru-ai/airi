import type { BillingService, PlanPeriod } from '../domain/billing/billing-service'
import type { ConfigKVService } from './config-kv'
import type { RevenuecatSubscriberClient } from './revenuecat-subscriber'

import { useLogger } from '@guiiai/logg'

const logger = useLogger('revenuecat-subscriptions')

/**
 * Copies the plan period that RevenueCat reports into the plan bucket of the Flux wallet.
 * It reads the customer's current entitlements. It does not read webhook
 * event types, so event order and repeated deliveries do not change the result.
 */
export function createRevenuecatSubscriptionSync(
  billing: Pick<BillingService, 'syncPlan'>,
  configKV: ConfigKVService,
  subscriber: RevenuecatSubscriberClient,
) {
  async function reconcile(userId: string): Promise<void> {
    const plans = await configKV.getOptional('REVENUECAT_SUBSCRIPTION_PLANS')
    // Plans are not sold when the map is unset. The wallet stays as it is.
    if (!plans)
      return

    await billing.syncPlan(userId, async (): Promise<PlanPeriod | null> => {
      const now = new Date()
      // The latest purchase wins when two plans are active, so an upgrade
      // replaces the old plan. Plans without an expiry are not sold.
      const [current] = (await subscriber.fetchEntitlements(userId))
        .filter(item => plans[item.productId]?.entitlementId === item.entitlementId)
        .filter(item => item.accessUntil != null && item.accessUntil > now)
        .sort((left, right) => right.purchasedAt.getTime() - left.purchasedAt.getTime())
      if (!current)
        return null

      return {
        entitlementId: current.entitlementId,
        quota: plans[current.productId]!.quotaCredit,
        periodStart: current.purchasedAt,
        expiresAt: current.accessUntil!,
      }
    })
    logger.withFields({ userId }).log('Plan Flux reconciled')
  }

  return { reconcile }
}

export type RevenuecatSubscriptionSync = ReturnType<typeof createRevenuecatSubscriptionSync>
