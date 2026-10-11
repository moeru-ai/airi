import type { InferOutput } from 'valibot'

import { check, nullable, object, optional, pipe, record, safeParse, string } from 'valibot'

import { createBadGatewayError, createServiceUnavailableError } from '../../utils/error'

const REQUEST_TIMEOUT_MS = 5_000

const instantSchema = pipe(
  string(),
  check(value => !Number.isNaN(Date.parse(value)), 'Invalid instant'),
)

const entitlementSchema = object({
  expires_date: nullable(instantSchema),
  grace_period_expires_date: optional(nullable(instantSchema)),
  product_identifier: string(),
  purchase_date: instantSchema,
})

const subscriptionSchema = object({
  expires_date: nullable(instantSchema),
  grace_period_expires_date: optional(nullable(instantSchema)),
  /** The time at which the store reported that the customer turned off the renewal. */
  unsubscribe_detected_at: nullable(instantSchema),
  /** The time of a failed renewal payment. The store retries the payment after it. */
  billing_issues_detected_at: nullable(instantSchema),
  refunded_at: nullable(instantSchema),
})

/**
 * RevenueCat Web Billing retries a failed renewal payment for up to 30 days.
 * A recovered payment charges the customer and starts the subscription again.
 * https://www.revenuecat.com/docs/web/web-billing/subscription-lifecycle
 */
const PAYMENT_RETRY_MS = 30 * 86_400_000

const subscriberResponseSchema = object({
  subscriber: object({
    entitlements: record(string(), entitlementSchema),
    subscriptions: record(string(), subscriptionSchema),
  }),
})

/** One entitlement as RevenueCat reports it now. It can be expired. */
export interface SubscriberEntitlement {
  entitlementId: string
  productId: string
  /** The latest purchase or renewal. It starts the current billing period. */
  purchasedAt: Date
  /** The end of access, grace period included. Null means no expiry. */
  accessUntil: Date | null
}

/** Access lasts through the grace period when RevenueCat grants one. */
function accessUntil(entitlement: Pick<InferOutput<typeof entitlementSchema>, 'expires_date' | 'grace_period_expires_date'>): Date | null {
  if (entitlement.expires_date == null)
    return null
  const expires = new Date(entitlement.expires_date)
  if (entitlement.grace_period_expires_date == null)
    return expires
  const grace = new Date(entitlement.grace_period_expires_date)
  return grace > expires ? grace : expires
}

/**
 * Reads a customer's entitlements and subscriptions from the RevenueCat REST API.
 * RevenueCat owns this state. The caller does not cache it.
 */
export function createRevenuecatSubscriberClient(input: {
  /** Secret API key. Reads fail with 503 when it is null. */
  apiKey: string | null
  /**
   * True when this deployment receives RevenueCat webhooks, so it sells subscriptions.
   * A missing API key is then a configuration error, not a deployment without subscriptions.
   */
  sellsSubscriptions: boolean
  fetch?: typeof globalThis.fetch
}) {
  const fetchImpl = input.fetch ?? globalThis.fetch

  async function fetchSubscriber(userId: string) {
    let response: Response
    try {
      response = await fetchImpl(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
        headers: {
          Authorization: `Bearer ${input.apiKey}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    }
    catch {
      throw createBadGatewayError('RevenueCat subscriber request failed')
    }

    if (!response.ok)
      throw createBadGatewayError('RevenueCat subscriber request failed', { lastStatusCode: response.status })

    let body: unknown
    try {
      body = await response.json()
    }
    catch {
      throw createBadGatewayError('RevenueCat subscriber response is invalid')
    }

    const parsed = safeParse(subscriberResponseSchema, body)
    if (!parsed.success)
      throw createBadGatewayError('RevenueCat subscriber response is invalid')

    return parsed.output.subscriber
  }

  async function fetchEntitlements(userId: string): Promise<SubscriberEntitlement[]> {
    if (!input.apiKey)
      throw createServiceUnavailableError('RevenueCat is not configured', 'REVENUECAT_NOT_CONFIGURED')

    return Object.entries((await fetchSubscriber(userId)).entitlements).map(([entitlementId, entitlement]) => ({
      entitlementId,
      productId: entitlement.product_identifier,
      purchasedAt: new Date(entitlement.purchase_date),
      accessUntil: accessUntil(entitlement),
    }))
  }

  /**
   * Tells whether the store can charge the customer again.
   * A cancelled or refunded subscription does not count. It keeps its access until the period ends.
   * Of the others, a subscription counts in two cases:
   * - It gives access now, so it renews at the end of the period.
   * - A renewal payment failed inside the retry window. It can be expired, but a recovered payment charges the customer.
   *
   * Without an API key the answer is no for a deployment that sells no subscriptions.
   * A deployment that sells them fails, because its subscriptions cannot be read.
   */
  async function hasRenewingSubscription(userId: string): Promise<boolean> {
    if (!input.apiKey) {
      if (input.sellsSubscriptions)
        throw createServiceUnavailableError('RevenueCat is not configured', 'REVENUECAT_NOT_CONFIGURED')
      return false
    }

    const now = Date.now()
    return Object.values((await fetchSubscriber(userId)).subscriptions).some((subscription) => {
      if (subscription.unsubscribe_detected_at !== null || subscription.refunded_at !== null)
        return false
      const until = accessUntil(subscription)
      if (until !== null && until.getTime() > now)
        return true
      return subscription.billing_issues_detected_at !== null
        && now - Date.parse(subscription.billing_issues_detected_at) < PAYMENT_RETRY_MS
    })
  }

  return { fetchEntitlements, hasRenewingSubscription }
}

export type RevenuecatSubscriberClient = ReturnType<typeof createRevenuecatSubscriberClient>
