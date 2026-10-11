import type { InferOutput } from 'valibot'

import { array, boolean, nullable, number, object, safeParse, string } from 'valibot'

import { createBadGatewayError, createServiceUnavailableError } from '../../utils/error'

const REQUEST_TIMEOUT_MS = 5_000

/** The largest page that the API returns. A customer has a few subscriptions, so one page is the usual case. */
const PAGE_LIMIT = 100

const subscriptionSchema = object({
  /** RevenueCat's own product id. `GET /products/{id}` gives the store identifier. */
  product_id: string(),
  status: string(),
  auto_renewal_status: string(),
  /** True while the customer has the entitlements of this subscription, grace period included. */
  gives_access: boolean(),
  /** Start of the current billing period, in milliseconds. */
  current_period_starts_at: number(),
  entitlements: object({
    items: array(object({ id: string(), lookup_key: string() })),
  }),
})

const subscriptionListSchema = object({
  items: array(subscriptionSchema),
  next_page: nullable(string()),
})

const activeEntitlementListSchema = object({
  items: array(object({
    entitlement_id: string(),
    /** End of access in milliseconds. Null means no expiry. */
    expires_at: nullable(number()),
  })),
})

const productSchema = object({ store_identifier: string() })

type Subscription = InferOutput<typeof subscriptionSchema>

/** One entitlement that the customer has now. */
export interface SubscriberEntitlement {
  /** The entitlement lookup key, for example `airi_go`. */
  entitlementId: string
  /** The store product identifier of the subscription that grants it. */
  productId: string
  /** Start of the current billing period. */
  purchasedAt: Date
  /** The end of access, grace period included. Null means no expiry. */
  accessUntil: Date | null
}

/** A subscription in one of these states is over or was never paid. The store does not charge it. */
const ENDED_STATUSES = new Set(['expired', 'incomplete', 'unknown'])

/**
 * The store can charge this subscription again.
 * `in_billing_retry` is included: the subscription gives no access, but a recovered payment charges the customer.
 */
function canCharge(subscription: Subscription): boolean {
  return !ENDED_STATUSES.has(subscription.status) && subscription.auto_renewal_status !== 'will_not_renew'
}

/**
 * Reads a customer's subscriptions and entitlements from the RevenueCat REST API v2.
 * RevenueCat owns this state. The caller does not cache it.
 */
export function createRevenuecatSubscriberClient(input: {
  /** API v2 secret key with read access to customer information and project configuration. */
  apiKey: string | null
  projectId: string | null
  /**
   * True when this deployment receives RevenueCat webhooks, so it sells subscriptions.
   * A missing configuration is then an error, not a deployment without subscriptions.
   */
  sellsSubscriptions: boolean
  fetch?: typeof globalThis.fetch
}) {
  const fetchImpl = input.fetch ?? globalThis.fetch
  const configured = Boolean(input.apiKey && input.projectId)

  /** Reads one resource. Returns null for 404, which is a customer that RevenueCat does not know. */
  async function read(url: string): Promise<unknown> {
    let response: Response
    try {
      response = await fetchImpl(url, {
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

    if (response.status === 404)
      return null
    if (!response.ok)
      throw createBadGatewayError('RevenueCat subscriber request failed', { lastStatusCode: response.status })

    try {
      return await response.json()
    }
    catch {
      throw createBadGatewayError('RevenueCat subscriber response is invalid')
    }
  }

  function projectUrl(path: string): string {
    return `https://api.revenuecat.com/v2/projects/${encodeURIComponent(input.projectId!)}${path}`
  }

  /** Every subscription of the customer, over all pages. A user who never opened a checkout has none. */
  async function fetchSubscriptions(userId: string): Promise<Subscription[]> {
    const subscriptions: Subscription[] = []
    let url: string | null = projectUrl(`/customers/${encodeURIComponent(userId)}/subscriptions?limit=${PAGE_LIMIT}`)
    while (url !== null) {
      const body = await read(url)
      if (body === null)
        return subscriptions
      const parsed = safeParse(subscriptionListSchema, body)
      if (!parsed.success)
        throw createBadGatewayError('RevenueCat subscriber response is invalid')
      subscriptions.push(...parsed.output.items)
      url = parsed.output.next_page
    }
    return subscriptions
  }

  /**
   * The entitlements that the customer has now, each with the subscription that grants it.
   * The subscription gives the product and the billing period start. The active entitlement gives the end of access.
   * When two subscriptions grant one entitlement, the later period start is used.
   */
  async function fetchEntitlements(userId: string): Promise<SubscriberEntitlement[]> {
    if (!configured)
      throw createServiceUnavailableError('RevenueCat is not configured', 'REVENUECAT_NOT_CONFIGURED')

    const granting = (await fetchSubscriptions(userId))
      .filter(subscription => subscription.gives_access)
      .sort((left, right) => right.current_period_starts_at - left.current_period_starts_at)
    if (granting.length === 0)
      return []

    const active = safeParse(activeEntitlementListSchema, await read(projectUrl(`/customers/${encodeURIComponent(userId)}/active_entitlements?limit=${PAGE_LIMIT}`)))
    if (!active.success)
      throw createBadGatewayError('RevenueCat subscriber response is invalid')
    const accessUntil = new Map(active.output.items.map(item => [item.entitlement_id, item.expires_at]))

    const entitlements: SubscriberEntitlement[] = []
    const seen = new Set<string>()
    for (const subscription of granting) {
      const granted = subscription.entitlements.items.filter(item => accessUntil.has(item.id) && !seen.has(item.id))
      if (granted.length === 0)
        continue
      const product = safeParse(productSchema, await read(projectUrl(`/products/${encodeURIComponent(subscription.product_id)}`)))
      if (!product.success)
        throw createBadGatewayError('RevenueCat subscriber response is invalid')
      for (const item of granted) {
        seen.add(item.id)
        const expiresAt = accessUntil.get(item.id)!
        entitlements.push({
          entitlementId: item.lookup_key,
          productId: product.output.store_identifier,
          purchasedAt: new Date(subscription.current_period_starts_at),
          accessUntil: expiresAt === null ? null : new Date(expiresAt),
        })
      }
    }
    return entitlements
  }

  /**
   * Tells whether the store can charge the customer again.
   * RevenueCat reports the status and the renewal status of each subscription, so nothing is inferred from dates.
   * A cancelled subscription keeps its access until the period ends, and it does not count.
   *
   * Without a configuration the answer is no for a deployment that sells no subscriptions.
   * A deployment that sells them fails, because its subscriptions cannot be read.
   */
  async function hasRenewingSubscription(userId: string): Promise<boolean> {
    if (!configured) {
      if (input.sellsSubscriptions)
        throw createServiceUnavailableError('RevenueCat is not configured', 'REVENUECAT_NOT_CONFIGURED')
      return false
    }

    return (await fetchSubscriptions(userId)).some(canCharge)
  }

  return { fetchEntitlements, hasRenewingSubscription }
}

export type RevenuecatSubscriberClient = ReturnType<typeof createRevenuecatSubscriberClient>
