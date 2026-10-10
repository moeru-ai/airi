import type { BillingService, CapacitorPeriod } from '../domain/billing/billing-service'
import type { ConfigKVService } from './config-kv'
import type { RevenuecatSubscriberClient } from './revenuecat-subscriber'

import { useLogger } from '@guiiai/logg'

const logger = useLogger('revenuecat-subscriptions')

/**
 * Copies the capacitor period that RevenueCat reports into the capacitor bucket of the Flux wallet.
 * It reads the customer's current entitlements. It does not read webhook
 * event types, so event order and repeated deliveries do not change the result.
 */
export function createRevenuecatSubscriptionSync(
  billing: Pick<BillingService, 'syncCapacitor'>,
  configKV: ConfigKVService,
  subscriber: RevenuecatSubscriberClient,
) {
  async function reconcile(userId: string): Promise<void> {
    const capacitors = await configKV.getOptional('REVENUECAT_CAPACITORS')
    // Capacitors are not sold when the map is unset. The wallet stays as it is.
    if (!capacitors)
      return

    await billing.syncCapacitor(userId, async (): Promise<CapacitorPeriod | null> => {
      const now = new Date()
      // The latest purchase wins when two capacitors are active, so an upgrade
      // replaces the old capacitor. Capacitors without an expiry are not sold.
      const [current] = (await subscriber.fetchEntitlements(userId))
        .filter(item => capacitors[item.productId]?.entitlementId === item.entitlementId)
        .filter(item => item.accessUntil != null && item.accessUntil > now)
        .sort((left, right) => right.purchasedAt.getTime() - left.purchasedAt.getTime())
      if (!current)
        return null

      return {
        quota: capacitors[current.productId]!.quota,
        periodStart: current.purchasedAt,
        expiresAt: current.accessUntil!,
      }
    })
    logger.withFields({ userId }).log('Capacitor Flux reconciled')
  }

  return { reconcile }
}

export type RevenuecatSubscriptionSync = ReturnType<typeof createRevenuecatSubscriptionSync>
