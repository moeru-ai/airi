import { useLogger } from '@guiiai/logg'
import { array, boolean, nullish, object, safeParse, string } from 'valibot'

import { createBadGatewayError } from '../../utils/error'

const logger = useLogger('revenuecat-cancellation')

const REQUEST_TIMEOUT_MS = 5_000

/** One page holds every subscription of a customer. A customer has one Capacitor line, so the list is short. */
const PAGE_LIMIT = 100

/** The store name of RevenueCat Web Billing. The cancel action accepts no other store. */
const WEB_BILLING_STORE = 'rc_billing'

const subscriptionListSchema = object({
  items: array(object({
    id: string(),
    store: string(),
    gives_access: boolean(),
    auto_renewal_status: nullish(string()),
  })),
})

/**
 * Stops the renewal of a customer's Web Billing subscriptions through the RevenueCat REST API v2.
 * Account deletion calls it, because a deleted user cannot open the management URL.
 * API v2 needs its own secret key. The v1 key of the subscriber reads does not work.
 */
export function createRevenuecatCancellation(input: {
  /** API v2 secret key with `customer_information:subscriptions:read_write`. */
  apiKey: string | null
  projectId: string | null
  fetch?: typeof globalThis.fetch
}) {
  const fetchImpl = input.fetch ?? globalThis.fetch

  async function request(path: string, method: 'GET' | 'POST'): Promise<Response> {
    try {
      return await fetchImpl(`https://api.revenuecat.com/v2/projects/${encodeURIComponent(input.projectId!)}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${input.apiKey}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    }
    catch {
      throw createBadGatewayError('RevenueCat subscription request failed')
    }
  }

  /**
   * Cancels each Web Billing subscription that still renews. Returns the cancelled subscription ids.
   * The customer keeps access until the period ends. RevenueCat then sends `EXPIRATION`.
   * A repeated call finds no renewing subscription, so a retry of the deletion is safe.
   * A failed call throws, and the caller must not delete the account.
   */
  async function cancelRenewals(userId: string): Promise<string[]> {
    if (!input.apiKey || !input.projectId) {
      // The deletion continues. An operator must cancel the subscription in the RevenueCat dashboard.
      logger.withFields({ userId }).warn('RevenueCat API v2 is not configured. Subscriptions are not cancelled.')
      return []
    }

    const customer = `/customers/${encodeURIComponent(userId)}`
    const listed = await request(`${customer}/subscriptions?limit=${PAGE_LIMIT}`, 'GET')
    // A user who never opened the Capacitor page is not a RevenueCat customer.
    if (listed.status === 404)
      return []
    if (!listed.ok)
      throw createBadGatewayError('RevenueCat subscription request failed', { lastStatusCode: listed.status })

    let body: unknown
    try {
      body = await listed.json()
    }
    catch {
      throw createBadGatewayError('RevenueCat subscription response is invalid')
    }
    const parsed = safeParse(subscriptionListSchema, body)
    if (!parsed.success)
      throw createBadGatewayError('RevenueCat subscription response is invalid')

    const renewing = parsed.output.items.filter(item =>
      item.store === WEB_BILLING_STORE && item.gives_access && item.auto_renewal_status !== 'will_not_renew')
    for (const subscription of renewing) {
      const cancelled = await request(`/subscriptions/${encodeURIComponent(subscription.id)}/actions/cancel`, 'POST')
      if (!cancelled.ok)
        throw createBadGatewayError('RevenueCat subscription cancel failed', { lastStatusCode: cancelled.status })
    }

    const cancelledIds = renewing.map(subscription => subscription.id)
    logger.withFields({ userId, cancelledIds }).log('RevenueCat subscriptions cancelled')
    return cancelledIds
  }

  return { cancelRenewals }
}

export type RevenuecatCancellation = ReturnType<typeof createRevenuecatCancellation>
