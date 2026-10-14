import type { InferOutput } from 'valibot'

import { array, boolean, nullable, number, object, optional, safeParse, string } from 'valibot'

import { createBadGatewayError, createServiceUnavailableError } from '../../utils/error'

const REQUEST_TIMEOUT_MS = 5_000

/** The largest page that the API returns. A customer has a few subscriptions, so one page is the usual case. */
const PAGE_LIMIT = 100

const subscriptionSchema = object({
  /** RevenueCat's subscription id. A product change names the subscription that it replaces. */
  id: string(),
  /** The store that bills the subscription. Only a web store can change the product from the web app. */
  store: string(),
  /**
   * RevenueCat's own product id. `GET /products/{id}` gives the store identifier.
   * Null for a promotional subscription, which a person grants and no store sells.
   */
  product_id: nullable(string()),
  status: string(),
  auto_renewal_status: string(),
  /** True while the customer has the entitlements of this subscription, grace period included. */
  gives_access: boolean(),
  /** Start of the current billing period, in milliseconds. */
  current_period_starts_at: number(),
  /** End of the current billing period, in milliseconds. Null for a subscription without an end. */
  current_period_ends_at: nullable(number()),
  /**
   * The state at the next renewal. `product` differs from `product_id` when a downgrade is scheduled.
   * It also appears with the same product after an early renewal, or before a failed renewal.
   */
  pending_changes: optional(nullable(object({
    product: nullable(object({ id: string() })),
  }))),
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

const subscriberTokenSchema = object({ access_token: string() })

/**
 * The stores that the Web SDK can change a product for.
 * App Store and Google Play subscriptions change only in the store that bills them.
 */
const WEB_STORES = new Set(['rc_billing', 'stripe'])

type Subscription = InferOutput<typeof subscriptionSchema>

/** What the Web SDK needs to replace the customer's subscription with another product. */
export interface ProductChangeGrant {
  subscriptionId: string
  /** A short-lived token that lets the browser change this customer's subscription. */
  subscriberToken: string
}

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
  /** Another product that replaces this one at the next renewal, for example after a downgrade. */
  pendingChange: { productId: string, startsAt: Date } | null
}

/**
 * A subscription in one of these states is over or was never paid. The store does not charge it.
 * `unknown` is not here: RevenueCat cannot tell the access, and the renewal status then decides.
 */
const ENDED_STATUSES = new Set(['expired', 'incomplete'])

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
  /** The id of the RevenueCat Web Billing app, for example `app0a4944c9ea`. Product changes need it. */
  webAppId: string | null
  /**
   * True when this deployment receives RevenueCat webhooks, so it sells subscriptions.
   * A missing configuration is then an error, not a deployment without subscriptions.
   */
  sellsSubscriptions: boolean
  fetch?: typeof globalThis.fetch
}) {
  const fetchImpl = input.fetch ?? globalThis.fetch
  const configured = Boolean(input.apiKey && input.projectId)

  /** Sends one request. Returns null for 404, which is a customer that RevenueCat does not know. */
  async function request(url: string, init: { method: 'GET' } | { method: 'POST', body: unknown } = { method: 'GET' }): Promise<unknown> {
    let response: Response
    try {
      response = await fetchImpl(url, {
        method: init.method,
        headers: {
          Authorization: `Bearer ${input.apiKey}`,
          Accept: 'application/json',
          ...(init.method === 'POST' && { 'Content-Type': 'application/json' }),
        },
        ...(init.method === 'POST' && { body: JSON.stringify(init.body) }),
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

  /**
   * RevenueCat product id to store identifier. Both ids of a product never change, so the map never expires.
   * The product endpoint shares a quota of 60 requests a minute for the whole project, and each sync needs it.
   * The map lives as long as the process and holds one entry for each product in the project.
   */
  const storeIdentifiers = new Map<string, string>()

  async function storeIdentifierOf(productId: string): Promise<string> {
    const known = storeIdentifiers.get(productId)
    if (known)
      return known
    const product = safeParse(productSchema, await request(projectUrl(`/products/${encodeURIComponent(productId)}`)))
    if (!product.success)
      throw createBadGatewayError('RevenueCat subscriber response is invalid')
    storeIdentifiers.set(productId, product.output.store_identifier)
    return product.output.store_identifier
  }

  function projectUrl(path: string): string {
    return `https://api.revenuecat.com/v2/projects/${encodeURIComponent(input.projectId!)}${path}`
  }

  /** Every subscription of the customer, over all pages. A user who never opened a checkout has none. */
  async function fetchSubscriptions(userId: string): Promise<Subscription[]> {
    const subscriptions: Subscription[] = []
    let url: string | null = projectUrl(`/customers/${encodeURIComponent(userId)}/subscriptions?limit=${PAGE_LIMIT}`)
    while (url !== null) {
      const body = await request(url)
      if (body === null)
        return subscriptions
      const parsed = safeParse(subscriptionListSchema, body)
      if (!parsed.success)
        throw createBadGatewayError('RevenueCat subscriber response is invalid')
      subscriptions.push(...parsed.output.items)
      // The API returned an absolute URL in a real response. Its reference shows a path, so both resolve here.
      url = parsed.output.next_page === null ? null : new URL(parsed.output.next_page, url).toString()
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

    // The two lists are independent. Reading them together keeps one RevenueCat round trip off the
    // Capacitor page, which waits for this read. A customer without subscriptions costs one extra read.
    const [subscriptions, activeBody] = await Promise.all([
      fetchSubscriptions(userId),
      request(projectUrl(`/customers/${encodeURIComponent(userId)}/active_entitlements?limit=${PAGE_LIMIT}`)),
    ])
    const granting = subscriptions
      .filter(subscription => subscription.gives_access)
      .sort((left, right) => right.current_period_starts_at - left.current_period_starts_at)
    if (granting.length === 0)
      return []

    const active = safeParse(activeEntitlementListSchema, activeBody)
    if (!active.success)
      throw createBadGatewayError('RevenueCat subscriber response is invalid')
    const accessUntil = new Map(active.output.items.map(item => [item.entitlement_id, item.expires_at]))

    // Assign each entitlement to the latest subscription that grants it, before any product read.
    const seen = new Set<string>()
    const grants = granting.flatMap((subscription) => {
      const granted = subscription.entitlements.items.filter(item => accessUntil.has(item.id) && !seen.has(item.id))
      // A promotional subscription has no product. No Capacitor is mapped to it, so it grants none.
      if (granted.length === 0 || subscription.product_id === null)
        return []
      granted.forEach(item => seen.add(item.id))
      return [{ subscription, productId: subscription.product_id, granted }]
    })

    const resolved = await Promise.all(grants.map(async ({ subscription, productId }) => {
      const pendingProductId = subscription.pending_changes?.product?.id
      const pending = pendingProductId && pendingProductId !== productId && subscription.current_period_ends_at !== null
        ? { productId: await storeIdentifierOf(pendingProductId), startsAt: new Date(subscription.current_period_ends_at) }
        : null
      return { storeIdentifier: await storeIdentifierOf(productId), pending }
    }))

    return grants.flatMap(({ subscription, granted }, index) => granted.map((item) => {
      const expiresAt = accessUntil.get(item.id)!
      return {
        entitlementId: item.lookup_key,
        productId: resolved[index]!.storeIdentifier,
        purchasedAt: new Date(subscription.current_period_starts_at),
        accessUntil: expiresAt === null ? null : new Date(expiresAt),
        pendingChange: resolved[index]!.pending,
      }
    }))
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

  /**
   * Prepares a product change for the customer's web subscription.
   * Returns null when the customer has no web subscription with access, for example when the App Store bills it.
   * The token is a credential for this customer only. The caller returns it to the signed-in customer and keeps no copy.
   */
  async function grantProductChange(userId: string): Promise<ProductChangeGrant | null> {
    if (!configured || !input.webAppId)
      throw createServiceUnavailableError('RevenueCat product changes are not configured', 'REVENUECAT_NOT_CONFIGURED')

    const [subscription] = (await fetchSubscriptions(userId))
      .filter(item => item.gives_access && WEB_STORES.has(item.store))
      .sort((left, right) => right.current_period_starts_at - left.current_period_starts_at)
    if (!subscription)
      return null

    const token = safeParse(subscriberTokenSchema, await request(
      projectUrl(`/apps/${encodeURIComponent(input.webAppId)}/authenticate`),
      { method: 'POST', body: { app_user_id: userId } },
    ))
    if (!token.success)
      throw createBadGatewayError('RevenueCat subscriber response is invalid')
    return { subscriptionId: subscription.id, subscriberToken: token.output.access_token }
  }

  return { fetchEntitlements, hasRenewingSubscription, grantProductChange }
}

export type RevenuecatSubscriberClient = ReturnType<typeof createRevenuecatSubscriberClient>
