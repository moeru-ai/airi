import type { RevenuecatSubscriptionSync } from '../../../services/adapters/revenuecat-subscriptions'

import { Buffer } from 'node:buffer'
import { createHmac, timingSafeEqual } from 'node:crypto'

import { useLogger } from '@guiiai/logg'
import { array, object, optional, safeParse, string } from 'valibot'

import { createBadRequestError, createServiceUnavailableError, createUnauthorizedError } from '../../../utils/error'

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
 * Verifies a RevenueCat webhook, then reconciles the plan Flux of the users that it names.
 * The event type does not select a plan rule, so a repeated or late delivery is safe.
 */
export function createWebhookOperation(
  subscriptionSync: RevenuecatSubscriptionSync,
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

    const userIds = new Set([
      ...(event.app_user_id ? [event.app_user_id] : []),
      ...(event.transferred_from ?? []),
      ...(event.transferred_to ?? []),
    ])
    for (const userId of userIds)
      await subscriptionSync.reconcile(userId)
    return { received: true }
  }
}
