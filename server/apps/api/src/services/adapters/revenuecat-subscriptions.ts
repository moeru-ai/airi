import type { SubscriptionService } from '../domain/subscriptions'
import type { ConfigKVService } from './config-kv'

import { useLogger } from '@guiiai/logg'

const logger = useLogger('revenuecat-subscriptions')

export interface RevenuecatSyncEvent {
  id: string
  type: string
  appUserId: string
  entitlementIds: string[]
  productId?: string | null
  store?: string | null
  environment?: string | null
  expirationAtMs?: number | null
  purchasedAtMs?: number | null
}

/** Webhook types that open a fresh quota period. Unused quota dies with the old period. */
const PERIOD_OPENING_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'PRODUCT_CHANGE',
])

/**
 * Translates RevenueCat purchase webhooks into Credit grants.
 * Entitlement status stays on RevenueCat. Other event types are audit-only.
 */
export function createRevenuecatSubscriptionSync(
  subscriptions: SubscriptionService,
  configKV: ConfigKVService,
) {
  /**
   * Grants Credits for one period-opening event.
   * Unknown products and other event types ack without a grant.
   */
  async function syncEvent(event: RevenuecatSyncEvent): Promise<{ synced: boolean }> {
    if (!PERIOD_OPENING_EVENTS.has(event.type) || event.entitlementIds.length === 0 || !event.productId)
      return { synced: false }

    const plans = await configKV.getOptional('REVENUECAT_SUBSCRIPTION_PLANS')
    const plan = plans?.[event.productId]
    if (!plan)
      return { synced: false }

    const expiresAt = event.expirationAtMs == null ? null : new Date(event.expirationAtMs)
    const periodStart = event.purchasedAtMs == null ? new Date() : new Date(event.purchasedAtMs)
    let granted = false

    for (const entitlementId of event.entitlementIds) {
      if (entitlementId !== plan.entitlementId) {
        logger.withFields({ eventId: event.id, entitlementId }).warn('Entitlement does not match plan mapping')
        continue
      }

      await subscriptions.openPeriod({
        userId: event.appUserId,
        entitlementId,
        grantedCredit: plan.quotaCredit,
        periodStart,
        periodEnd: expiresAt,
        eventKey: `${event.id}:${entitlementId}`,
      })
      granted = true
    }

    return { synced: granted }
  }

  return { syncEvent }
}

export type RevenuecatSubscriptionSync = ReturnType<typeof createRevenuecatSubscriptionSync>
