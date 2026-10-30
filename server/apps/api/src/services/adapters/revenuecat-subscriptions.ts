import type { BillingService, CapacitorPeriod } from '../domain/billing/billing-service'
import type { ConfigDefinitions, ConfigKVService } from './config-kv'
import type { RevenuecatSubscriberClient, SubscriberEntitlement } from './revenuecat-subscriber'

import { useLogger } from '@guiiai/logg'

const logger = useLogger('revenuecat-subscriptions')

/** Configured Capacitor quotas and refill intervals for the client's package cards. */
export interface CapacitorCatalog {
  capacitors: { productId: string, quota: number }[]
  /** Null means that the Capacitor refills at each renewal. */
  resetInterval: NonNullable<ConfigDefinitions['CAPACITOR_RESET_INTERVAL']> | null
}

/**
 * The Capacitor quota of one entitlement, or null when it grants no Capacitor.
 * A store subscription uses the quota of its product, if the product grants this entitlement.
 * A promotional subscription has no product. It uses the one quota that the products of its entitlement share.
 * When those products have different quotas, the grant names no Capacitor, so it grants none.
 */
export function capacitorQuota(
  capacitors: NonNullable<ConfigDefinitions['REVENUECAT_CAPACITORS']>,
  entitlement: Pick<SubscriberEntitlement, 'entitlementId' | 'productId'>,
): number | null {
  if (entitlement.productId !== null) {
    const capacitor = capacitors[entitlement.productId]
    return capacitor?.entitlementId === entitlement.entitlementId ? capacitor.quota : null
  }
  const quotas = new Set(Object.values(capacitors)
    .filter(capacitor => capacitor.entitlementId === entitlement.entitlementId)
    .map(capacitor => capacitor.quota))
  return quotas.size === 1 ? [...quotas][0]! : null
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
  async function reconcile(userId: string): Promise<void> {
    const capacitors = await configKV.getOptional('REVENUECAT_CAPACITORS')
    // Capacitors are not sold when the map is unset or empty. The wallet stays as it is.
    // An unset ConfigKV row resolves to the empty default, so the empty map is the usual case.
    // A sync with no products would expire every active Capacitor.
    if (!capacitors || Object.keys(capacitors).length === 0)
      return

    const period = await billing.syncCapacitor(userId, async (): Promise<CapacitorPeriod | null> => {
      const now = new Date()
      // The latest purchase wins when two capacitors are active, so an upgrade
      // replaces the old capacitor. Capacitors without an expiry are not sold.
      const [current] = (await subscriber.fetchEntitlements(userId))
        .filter(item => item.accessUntil != null && item.accessUntil > now)
        .flatMap((item) => {
          const quota = capacitorQuota(capacitors, item)
          return quota === null ? [] : [{ ...item, quota }]
        })
        .sort((left, right) => right.purchasedAt.getTime() - left.purchasedAt.getTime())
      if (!current)
        return null

      return {
        quota: current.quota,
        periodStart: current.purchasedAt,
        expiresAt: current.accessUntil!,
      }
    })
    // The result tells an operator whether a paid customer got a Capacitor.
    logger.withFields({ userId, quota: period?.quota ?? null, expiresAt: period?.expiresAt.toISOString() ?? null }).log('Capacitor Flux reconciled')
  }

  /** The configured product ids that grant Capacitor Flux. */
  async function listProductIds(): Promise<string[]> {
    return Object.keys(await configKV.getOptional('REVENUECAT_CAPACITORS') ?? {})
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

  return { reconcile, listProductIds, listCapacitors }
}

export type RevenuecatSubscriptionSync = ReturnType<typeof createRevenuecatSubscriptionSync>
