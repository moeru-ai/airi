import type { BillingService, CapacitorPeriod } from '../domain/billing/billing-service'
import type { ConfigKVService } from './config-kv'
import type { RevenuecatSubscriberClient } from './revenuecat-subscriber'

import { useLogger } from '@guiiai/logg'

const logger = useLogger('revenuecat-subscriptions')

/** A Capacitor that replaces the current one at the next renewal. */
export interface CapacitorPendingChange {
  productId: string
  startsAt: Date
}

export interface CapacitorCatalog {
  capacitors: { productId: string, quota: number }[]
  resetInterval: 'day' | 'week' | null
}

/**
 * Copies the capacitor period that RevenueCat reports into the capacitor bucket of the Flux wallet.
 * It reads the customer's current entitlements. It does not read webhook
 * event types, so event order and repeated deliveries do not change the result.
 */
export function createRevenuecatSubscriptionSync(
  billing: Pick<BillingService, 'syncCapacitor'>,
  configKV: ConfigKVService,
  subscriber: Pick<RevenuecatSubscriberClient, 'fetchEntitlements'>,
) {
  /**
   * Returns the Capacitor that replaces the current one at the next renewal, for the Capacitor page.
   * Null when nothing changes, or when the next product grants no Capacitor.
   */
  async function reconcile(userId: string): Promise<CapacitorPendingChange | null> {
    const capacitors = await configKV.getOptional('REVENUECAT_CAPACITORS')
    // Capacitors are not sold when the map is unset or empty. The wallet stays as it is.
    // An unset ConfigKV row resolves to the empty default, so the empty map is the usual case.
    // A sync with no products would expire every active Capacitor.
    if (!capacitors || Object.keys(capacitors).length === 0)
      return null

    let pendingChange: CapacitorPendingChange | null = null

    const period = await billing.syncCapacitor(userId, async (): Promise<CapacitorPeriod | null> => {
      const now = new Date()
      // The latest purchase wins when two capacitors are active, so an upgrade
      // replaces the old capacitor. Capacitors without an expiry are not sold.
      const [current] = (await subscriber.fetchEntitlements(userId))
        .filter(item => capacitors[item.productId]?.entitlementId === item.entitlementId)
        .filter(item => item.accessUntil != null && item.accessUntil > now)
        .sort((left, right) => right.purchasedAt.getTime() - left.purchasedAt.getTime())
      if (!current)
        return null

      if (current.pendingChange && capacitors[current.pendingChange.productId])
        pendingChange = current.pendingChange
      return {
        quota: capacitors[current.productId]!.quota,
        periodStart: current.purchasedAt,
        expiresAt: current.accessUntil!,
      }
    })
    // The result tells an operator whether a paid customer got a Capacitor.
    logger.withFields({ userId, quota: period?.quota ?? null, expiresAt: period?.expiresAt.toISOString() ?? null }).log('Capacitor Flux reconciled')
    return pendingChange
  }

  /**
   * The Capacitors that the client can sell, with the Flux that each one holds and how often it refills.
   * A purchase of a product outside this list gets no Capacitor Flux, so the client lists no other product.
   * `resetInterval` is null when the Capacitor refills only at each renewal.
   */
  async function listCapacitors(): Promise<CapacitorCatalog> {
    const [capacitors, resetInterval] = await Promise.all([
      configKV.getOptional('REVENUECAT_CAPACITORS'),
      configKV.getOptional('CAPACITOR_RESET_INTERVAL'),
    ])
    return {
      capacitors: Object.entries(capacitors ?? {}).map(([productId, capacitor]) => ({ productId, quota: capacitor.quota })),
      resetInterval: resetInterval ?? null,
    }
  }

  return { reconcile, listCapacitors }
}

export type RevenuecatSubscriptionSync = ReturnType<typeof createRevenuecatSubscriptionSync>
