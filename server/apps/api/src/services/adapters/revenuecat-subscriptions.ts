import type { BillingService, CapacitorPeriod } from '../domain/billing/billing-service'
import type { ConfigDefinitions, ConfigKVService } from './config-kv'
import type { RevenuecatSubscriberClient } from './revenuecat-subscriber'

import { useLogger } from '@guiiai/logg'

const logger = useLogger('revenuecat-subscriptions')

/** A Capacitor that replaces the current one at the next renewal. */
export interface CapacitorPendingChange {
  productId: string
  startsAt: Date
}

/** Configured Capacitor quotas and refill intervals for the client's package cards. */
export interface CapacitorCatalog {
  capacitors: { productId: string, quota: number }[]
  /** Null means that the Capacitor refills at each renewal. */
  resetInterval: NonNullable<ConfigDefinitions['CAPACITOR_RESET_INTERVAL']> | null
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
   * Returns the configured Capacitors for the client to sell and describe.
   * A purchase outside this catalog grants no Capacitor Flux.
   */
  async function listCapacitors(): Promise<CapacitorCatalog> {
    const [capacitors, resetInterval] = await Promise.all([
      configKV.getOptional('REVENUECAT_CAPACITORS'),
      configKV.getOptional('CAPACITOR_RESET_INTERVAL'),
    ])
    return {
      capacitors: capacitors
        ? Object.entries(capacitors).map(([productId, capacitor]) => ({ productId, quota: capacitor.quota }))
        : [],
      resetInterval: resetInterval ?? null,
    }
  }

  return { reconcile, listCapacitors }
}

export type RevenuecatSubscriptionSync = ReturnType<typeof createRevenuecatSubscriptionSync>
