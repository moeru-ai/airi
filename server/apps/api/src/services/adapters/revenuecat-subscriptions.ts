import type { SubscriptionStatus } from '../../schemas/subscription'
import type { SubscriptionService } from '../domain/subscriptions'
import type { ConfigKVService } from './config-kv'
import type { RevenuecatApiClient } from './revenuecat-api'

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
  'UNCANCELLATION',
  'SUBSCRIPTION_EXTENDED',
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

function toDate(value: number | null | undefined): Date | null {
  return value == null ? null : new Date(value)
}

/**
 * Translates RevenueCat webhooks and API state into subscription-core calls.
 * Product-to-plan mapping and event semantics live here; the core stays
 * source-agnostic so future integrations reuse it unchanged.
 */
export function createRevenuecatSubscriptionSync(
  subscriptions: SubscriptionService,
  configKV: ConfigKVService,
  api?: RevenuecatApiClient | null,
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

    const expiresAt = toDate(event.expirationAtMs)
    const periodStart = toDate(event.purchasedAtMs) ?? new Date()

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
    }

    return { synced: true }
  }

  /**
   * Aligns one user with the canonical API state. Skips silently when the
   * API is unconfigured or unreachable.
   */
  async function reconcile(userId: string): Promise<void> {
    if (!api?.enabled)
      return
    const remote = await api.getActiveEntitlements(userId)
    if (!remote)
      return

    const plans = await configKV.getOptional('REVENUECAT_SUBSCRIPTION_PLANS') ?? {}
    const quotaByEntitlement = new Map(
      Object.values(plans).map(plan => [plan.entitlementId, plan.quotaCredit]),
    )

    await subscriptions.reconcile(userId, remote.map(item => ({
      entitlementId: item.lookupKey,
      active: true,
      expiresAt: item.expiresAtMs == null ? null : new Date(item.expiresAtMs),
      quotaCredit: quotaByEntitlement.get(item.lookupKey),
    })))
  }

  return { syncEvent, reconcile }
}

export type RevenuecatSubscriptionSync = ReturnType<typeof createRevenuecatSubscriptionSync>
