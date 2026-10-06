import type { SubscriptionStatus } from '../../schemas/subscription'
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

/** Webhook types that change status without opening a period. */
const STATUS_BY_EVENT: Record<string, SubscriptionStatus> = {
  INITIAL_PURCHASE: 'active',
  RENEWAL: 'active',
  UNCANCELLATION: 'active',
  SUBSCRIPTION_EXTENDED: 'active',
  PRODUCT_CHANGE: 'active',
  BILLING_ISSUE: 'past_due',
  CANCELLATION: 'cancelled',
  EXPIRATION: 'expired',
}

/**
 * Translates RevenueCat webhooks into subscription-core calls.
 * Product-to-plan mapping and event semantics live here; the core stays
 * source-agnostic so future integrations reuse it unchanged.
 */
export function createRevenuecatSubscriptionSync(
  subscriptions: SubscriptionService,
  configKV: ConfigKVService,
) {
  /**
   * Syncs one webhook event. Unknown products and untracked types ack
   * without writes so RevenueCat stops retrying.
   */
  async function syncEvent(event: RevenuecatSyncEvent): Promise<{ synced: boolean }> {
    const status = STATUS_BY_EVENT[event.type] ?? null
    if (!status || event.entitlementIds.length === 0 || !event.productId)
      return { synced: false }

    const plans = await configKV.getOptional('REVENUECAT_SUBSCRIPTION_PLANS')
    const plan = plans?.[event.productId]
    if (!plan)
      return { synced: false }

    const expiresAt = event.expirationAtMs == null ? null : new Date(event.expirationAtMs)
    const periodStart = event.purchasedAtMs == null ? new Date() : new Date(event.purchasedAtMs)

    for (const entitlementId of event.entitlementIds) {
      if (entitlementId !== plan.entitlementId) {
        logger.withFields({ eventId: event.id, entitlementId }).warn('Entitlement does not match plan mapping')
        continue
      }

      await subscriptions.upsertSubscription({
        userId: event.appUserId,
        entitlementId,
        status,
        productId: event.productId,
        source: event.store,
        environment: event.environment,
        expiresAt,
      })

      if (PERIOD_OPENING_EVENTS.has(event.type)) {
        await subscriptions.openPeriod({
          userId: event.appUserId,
          entitlementId,
          grantedCredit: plan.quotaCredit,
          periodStart,
          periodEnd: expiresAt,
          eventKey: `${event.id}:${entitlementId}`,
        })
        await subscriptions.retireOtherEntitlements(event.appUserId, entitlementId)
      }
      else if (event.type === 'SUBSCRIPTION_EXTENDED' && expiresAt) {
        await subscriptions.extendPeriod({
          userId: event.appUserId,
          entitlementId,
          periodEnd: expiresAt,
        })
      }
    }

    return { synced: true }
  }

  return { syncEvent }
}

export type RevenuecatSubscriptionSync = ReturnType<typeof createRevenuecatSubscriptionSync>
