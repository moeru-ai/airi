import type Redis from 'ioredis'
import type { InferOutput } from 'valibot'

import { array, boolean, check, nullable, object, optional, picklist, pipe, record, safeParse, string } from 'valibot'

import { readCache, writeCache } from '../../libs/redis/cache'
import { createBadGatewayError, createGatewayTimeoutError, createServiceUnavailableError } from '../../utils/error'
import { userSubscriptionStatusRedisKey } from '../../utils/redis-keys'

const STATUS_TTL_SECONDS = 60
const REQUEST_TIMEOUT_MS = 5_000

const instantSchema = pipe(
  string(),
  check(value => !Number.isNaN(Date.parse(value)), 'Invalid instant'),
)

const entitlementSchema = object({
  expires_date: optional(nullable(instantSchema)),
  grace_period_expires_date: optional(nullable(instantSchema)),
  product_identifier: string(),
})

const subscriptionSchema = object({
  billing_issues_detected_at: optional(nullable(instantSchema)),
  unsubscribe_detected_at: optional(nullable(instantSchema)),
  store: optional(nullable(string())),
  is_sandbox: optional(boolean()),
})

const subscriberResponseSchema = object({
  subscriber: object({
    entitlements: record(string(), entitlementSchema),
    subscriptions: optional(record(string(), subscriptionSchema)),
  }),
})

const subscriptionEntitlementSchema = object({
  entitlementId: string(),
  productId: nullable(string()),
  store: nullable(string()),
  environment: nullable(string()),
  status: picklist(['active', 'past_due', 'cancelled']),
  expiresAt: nullable(string()),
})

export type SubscriptionEntitlement = InferOutput<typeof subscriptionEntitlementSchema>

type Subscriber = InferOutput<typeof subscriberResponseSchema>['subscriber']
type Entitlement = InferOutput<typeof entitlementSchema>

function parseInstant(value: string | null | undefined): Date | null {
  if (!value)
    return null
  return new Date(value)
}

/** Access lasts through the grace period when RevenueCat grants one. */
function accessUntil(entitlement: Entitlement): Date | null {
  const expires = parseInstant(entitlement.expires_date)
  const grace = parseInstant(entitlement.grace_period_expires_date)
  if (grace && (!expires || grace > expires))
    return grace
  return expires
}

function environmentOf(isSandbox: boolean | undefined): string | null {
  if (isSandbox == null)
    return null
  return isSandbox ? 'SANDBOX' : 'PRODUCTION'
}

function entitlementsFromSubscriber(subscriber: Subscriber, now: Date): SubscriptionEntitlement[] {
  const subscriptions = subscriber.subscriptions ?? {}
  const rows: SubscriptionEntitlement[] = []

  for (const [entitlementId, entitlement] of Object.entries(subscriber.entitlements)) {
    const until = accessUntil(entitlement)
    if (until && until.getTime() <= now.getTime())
      continue

    const productId = entitlement.product_identifier
    const subscription = subscriptions[productId]
    let status: SubscriptionEntitlement['status'] = 'active'
    if (subscription?.billing_issues_detected_at)
      status = 'past_due'
    else if (subscription?.unsubscribe_detected_at)
      status = 'cancelled'

    rows.push({
      entitlementId,
      productId,
      store: subscription?.store ?? null,
      environment: environmentOf(subscription?.is_sandbox),
      status,
      expiresAt: until?.toISOString() ?? null,
    })
  }

  rows.sort((left, right) => left.entitlementId.localeCompare(right.entitlementId))
  return rows
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
}

async function readCached(redis: Redis, userId: string): Promise<SubscriptionEntitlement[] | null> {
  const snapshot = await readCache(redis, userSubscriptionStatusRedisKey(userId))
  if (snapshot === null)
    return null
  let value: unknown
  try {
    value = JSON.parse(snapshot)
  }
  catch {
    return null
  }
  const parsed = safeParse(array(subscriptionEntitlementSchema), value)
  return parsed.success ? parsed.output : null
}

/**
 * Reads live entitlement status from RevenueCat.
 * A hit lasts 60 seconds. Call `invalidate` after a subscription webhook.
 */
export function createRevenuecatStatus(input: {
  apiKey: string | null
  redis: Redis
  fetch?: typeof globalThis.fetch
  now?: () => Date
}) {
  const fetchImpl = input.fetch ?? globalThis.fetch
  const now = input.now ?? (() => new Date())

  async function fetchStatus(userId: string): Promise<SubscriptionEntitlement[]> {
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
    catch (error) {
      if (isTimeout(error))
        throw createGatewayTimeoutError('RevenueCat status timed out')
      throw createBadGatewayError('RevenueCat status request failed')
    }

    if (response.status === 404)
      return []
    if (!response.ok)
      throw createBadGatewayError('RevenueCat status request failed', { lastStatusCode: response.status })

    let body: unknown
    try {
      body = await response.json()
    }
    catch {
      throw createBadGatewayError('RevenueCat status response is invalid')
    }

    const parsed = safeParse(subscriberResponseSchema, body)
    if (!parsed.success)
      throw createBadGatewayError('RevenueCat status response is invalid')
    return entitlementsFromSubscriber(parsed.output.subscriber, now())
  }

  async function read(userId: string): Promise<SubscriptionEntitlement[]> {
    const cached = await readCached(input.redis, userId)
    if (cached !== null)
      return cached
    const fresh = await fetchStatus(userId)
    await writeCache(input.redis, userSubscriptionStatusRedisKey(userId), JSON.stringify(fresh), {
      ttlSeconds: STATUS_TTL_SECONDS,
    })
    return fresh
  }

  async function invalidate(userId: string): Promise<void> {
    await input.redis.del(userSubscriptionStatusRedisKey(userId))
  }

  return { read, invalidate }
}

export type RevenuecatStatus = ReturnType<typeof createRevenuecatStatus>
