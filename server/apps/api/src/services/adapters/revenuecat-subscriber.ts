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

const subscriberResponseSchema = object({
  subscriber: object({
    entitlements: record(string(), entitlementSchema),
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
function accessUntil(entitlement: InferOutput<typeof entitlementSchema>): Date | null {
  if (entitlement.expires_date == null)
    return null
  const expires = new Date(entitlement.expires_date)
  if (entitlement.grace_period_expires_date == null)
    return expires
  const grace = new Date(entitlement.grace_period_expires_date)
  return grace > expires ? grace : expires
}

/**
 * Reads a customer's entitlements from the RevenueCat REST API.
 * RevenueCat owns this state. The caller does not cache it.
 */
export function createRevenuecatSubscriberClient(input: {
  /** Secret API key. Reads fail with 503 when it is null. */
  apiKey: string | null
  fetch?: typeof globalThis.fetch
}) {
  const fetchImpl = input.fetch ?? globalThis.fetch

  async function fetchEntitlements(userId: string): Promise<SubscriberEntitlement[]> {
    if (!input.apiKey)
      throw createServiceUnavailableError('RevenueCat is not configured', 'REVENUECAT_NOT_CONFIGURED')

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

    return Object.entries(parsed.output.subscriber.entitlements).map(([entitlementId, entitlement]) => ({
      entitlementId,
      productId: entitlement.product_identifier,
      purchasedAt: new Date(entitlement.purchase_date),
      accessUntil: accessUntil(entitlement),
    }))
  }

  return { fetchEntitlements }
}

export type RevenuecatSubscriberClient = ReturnType<typeof createRevenuecatSubscriberClient>
