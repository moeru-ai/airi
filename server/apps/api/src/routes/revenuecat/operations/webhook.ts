import type { InferOutput } from 'valibot'

import type { AccountEventPublisher } from '../../../services/adapters/account-events'
import type { RevenuecatSubscriberClient } from '../../../services/adapters/revenuecat-subscriber'
import type { RevenuecatSubscriptionSync } from '../../../services/adapters/revenuecat-subscriptions'

import { Buffer } from 'node:buffer'
import { createHmac, timingSafeEqual } from 'node:crypto'

import { useLogger } from '@guiiai/logg'
import { createBadRequestError, createServiceUnavailableError, createUnauthorizedError } from '@proj-airi/http-error-shared'
import { array, nonEmpty, number, object, optional, picklist, pipe, safeParse, string } from 'valibot'

const logger = useLogger('revenuecat')

const webhookSchema = object({
  api_version: string(),
  event: object({
    type: string(),
    id: string(),
    app_user_id: optional(string()),
    // TRANSFER names its users here and omits `app_user_id`.
    transferred_from: optional(array(string())),
    transferred_to: optional(array(string())),
  }),
})

/** Fields of a RENEWAL or BILLING_ISSUE event that the account event needs. */
const subscriptionEventEntries = {
  id: pipe(string(), nonEmpty()),
  app_user_id: pipe(string(), nonEmpty()),
  product_id: pipe(string(), nonEmpty()),
  event_timestamp_ms: number(),
  environment: picklist(['PRODUCTION', 'SANDBOX']),
}

const renewalWebhookSchema = object({
  event: object({ ...subscriptionEventEntries, expiration_at_ms: number() }),
})

const billingIssueWebhookSchema = object({
  event: object(subscriptionEventEntries),
})

export interface RevenuecatWebhookSecrets {
  authorization: string | null
  signingSecret: string | null
}

/**
 * Verifies the dashboard authorization header. Unset expectation disables
 * the check so HMAC-only integrations keep working.
 */
function verifyAuthorizationHeader(received: string | null, expected: string | null): boolean {
  if (!expected)
    return true
  if (!received)
    return false
  const receivedBytes = Buffer.from(received)
  const expectedBytes = Buffer.from(expected)
  if (receivedBytes.length !== expectedBytes.length)
    return false
  return timingSafeEqual(receivedBytes, expectedBytes)
}

/**
 * Verifies the HMAC signature over the raw body (`t.<rawBody>`, header
 * `t=<ts>,v1=<hex>`). The input must be the raw request bytes before JSON
 * parsing — re-serializing a parsed object changes the bytes and breaks
 * verification.
 */
function verifySignature(
  rawBody: string,
  header: string | null,
  secret: string | null,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!secret)
    return true
  if (!header)
    return false

  const parts = Object.fromEntries(header.split(',').map((part) => {
    const separator = part.indexOf('=')
    return [part.slice(0, separator), part.slice(separator + 1)]
  }))
  const timestamp = parts.t
  const expectedSignature = parts.v1
  if (!timestamp || !expectedSignature)
    return false

  const computed = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex')

  const computedBytes = Buffer.from(computed)
  const expectedBytes = Buffer.from(expectedSignature)
  if (computedBytes.length !== expectedBytes.length)
    return false
  return timingSafeEqual(computedBytes, expectedBytes) && Math.abs(nowSeconds - Number(timestamp)) <= 300
}

/**
 * Maps a RevenueCat event to the account event that Cloud turns into a notification.
 * Returns the publish call to run after the reconciliation. Returns null for event types without
 * a notification and for a store environment that this deployment does not grant.
 * Throws 400 when a mapped event type lacks a required field.
 *
 * - RENEWAL -> `subscription.renewed`. `periodEnd` is the new `expiration_at_ms`.
 * - BILLING_ISSUE -> `subscription.payment_failed`. RevenueCat sends no retry time, so `retryAt` stays unset.
 *
 * `plan` is the store product ID, which is also the key of the `REVENUECAT_CAPACITORS` config.
 */
function accountEventPublishFrom(
  body: unknown,
  type: string,
  subscriber: Pick<RevenuecatSubscriberClient, 'countsFor'>,
  accountEvents: Pick<AccountEventPublisher, 'publish'>,
): (() => Promise<string>) | null {
  if (type === 'RENEWAL') {
    const event = parseSubscriptionEvent(renewalWebhookSchema, body)
    if (!countsForDeployment(event, subscriber))
      return null
    return () => accountEvents.publish('subscription.renewed', {
      id: `revenuecat:${event.id}`,
      occurredAt: new Date(event.event_timestamp_ms),
      payload: { userId: event.app_user_id, plan: event.product_id, periodEnd: new Date(event.expiration_at_ms) },
    })
  }

  if (type === 'BILLING_ISSUE') {
    const event = parseSubscriptionEvent(billingIssueWebhookSchema, body)
    if (!countsForDeployment(event, subscriber))
      return null
    return () => accountEvents.publish('subscription.payment_failed', {
      id: `revenuecat:${event.id}`,
      occurredAt: new Date(event.event_timestamp_ms),
      payload: { userId: event.app_user_id, plan: event.product_id },
    })
  }

  return null
}

function parseSubscriptionEvent<TSchema extends typeof renewalWebhookSchema | typeof billingIssueWebhookSchema>(
  schema: TSchema,
  body: unknown,
): InferOutput<TSchema>['event'] {
  const parsed = safeParse(schema, body)
  if (!parsed.success)
    throw createBadRequestError('Invalid webhook event', 'INVALID_REQUEST', parsed.issues)
  return parsed.output.event
}

/**
 * A sandbox purchase of a production user grants nothing, so it also notifies nothing.
 * TestFlight builds buy in the sandbox, so real users can send these events.
 */
function countsForDeployment(
  event: { id: string, app_user_id: string, environment: 'PRODUCTION' | 'SANDBOX' },
  subscriber: Pick<RevenuecatSubscriberClient, 'countsFor'>,
): boolean {
  if (subscriber.countsFor(event.app_user_id, event.environment.toLowerCase()))
    return true
  logger.withFields({ id: event.id, environment: event.environment }).log('Skipping account event for another store environment')
  return false
}

/**
 * Verifies a RevenueCat webhook, then reconciles the capacitor Flux of the users that it names.
 * The event type does not select a capacitor rule, so a repeated or late delivery is safe.
 *
 * RENEWAL and BILLING_ISSUE then publish one account event. The publish runs after the
 * reconciliation. A publish error fails the request with 5xx, so RevenueCat retries the event.
 * The retry repeats the reconciliation, which is idempotent, and publishes the same `id` again.
 * Cloud deduplicates on that `id`.
 */
export function createWebhookOperation(
  subscriptionSync: RevenuecatSubscriptionSync,
  accountEvents: Pick<AccountEventPublisher, 'publish'>,
  subscriber: Pick<RevenuecatSubscriberClient, 'countsFor'>,
  secrets: RevenuecatWebhookSecrets,
) {
  return async (
    rawBody: string,
    headers: { authorization: string | null, signature: string | null },
  ): Promise<{ received: true }> => {
    if (!secrets.authorization && !secrets.signingSecret)
      throw createServiceUnavailableError('RevenueCat is not configured', 'REVENUECAT_NOT_CONFIGURED')

    if (!verifyAuthorizationHeader(headers.authorization, secrets.authorization))
      throw createUnauthorizedError('Invalid webhook authorization')

    if (!verifySignature(rawBody, headers.signature, secrets.signingSecret))
      throw createUnauthorizedError('Invalid webhook signature')

    let body: unknown
    try {
      body = JSON.parse(rawBody)
    }
    catch {
      throw createBadRequestError('Invalid webhook body', 'INVALID_REQUEST')
    }

    const parsed = safeParse(webhookSchema, body)
    if (!parsed.success)
      throw createBadRequestError('Invalid webhook event', 'INVALID_REQUEST', parsed.issues)

    const event = parsed.output.event
    logger.withFields({ type: event.type, id: event.id }).log('Webhook event received')

    if (event.type === 'TEST')
      return { received: true }

    // Map before the reconciliation, so an invalid event changes nothing.
    const publishAccountEvent = accountEventPublishFrom(body, event.type, subscriber, accountEvents)

    const userIds = new Set([
      ...(event.app_user_id ? [event.app_user_id] : []),
      ...(event.transferred_from ?? []),
      ...(event.transferred_to ?? []),
    ])
    for (const userId of userIds)
      await subscriptionSync.reconcile(userId)

    if (publishAccountEvent)
      await publishAccountEvent()
    return { received: true }
  }
}
