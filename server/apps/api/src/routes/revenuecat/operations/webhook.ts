import type { ConfigKVService } from '../../../services/adapters/config-kv'
import type { RevenuecatSubscriptionSync } from '../../../services/adapters/revenuecat-subscriptions'
import type { PaymentService } from '../../../services/domain/payment'

import { Buffer } from 'node:buffer'
import { createHmac, timingSafeEqual } from 'node:crypto'

import { useLogger } from '@guiiai/logg'
import { safeParse } from 'valibot'

import { createBadRequestError, createServiceUnavailableError, createUnauthorizedError } from '../../../utils/error'
import { evidenceReceiptFromEvent, FLUX_GRANT_EVENT, isSubscriptionEvent, resolveRevenuecatPack, revenuecatWebhookSchema } from '../event'

const logger = useLogger('revenuecat')

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
 * Verifies a RevenueCat webhook, then settles Flux through Payment CORE.
 * Only `NON_RENEWING_PURCHASE` grants. Subscription events, test events,
 * and unknown products ack 200 without a grant so RevenueCat stops retrying.
 */
export function createWebhookOperation(
  payment: PaymentService,
  configKV: ConfigKVService,
  subscriptionSync: RevenuecatSubscriptionSync,
  secrets: RevenuecatWebhookSecrets,
) {
  return async (
    rawBody: string,
    headers: { authorization: string | null, signature: string | null },
  ): Promise<{ received: true, granted?: boolean, synced?: boolean }> => {
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

    const parsed = safeParse(revenuecatWebhookSchema, body)
    if (!parsed.success)
      throw createBadRequestError('Invalid webhook event', 'INVALID_REQUEST', parsed.issues)

    const event = parsed.output.event
    logger.withFields({ type: event.type, id: event.id }).log('Webhook event received')

    if (event.type === 'TEST')
      return { received: true }

    if (isSubscriptionEvent(event.type)) {
      if (!event.app_user_id) {
        logger.withFields({ id: event.id }).warn('Subscription event is missing app_user_id')
        return { received: true }
      }
      const result = await subscriptionSync.syncEvent({
        id: event.id,
        type: event.type,
        appUserId: event.app_user_id,
        entitlementIds: (event.entitlement_ids ?? []).filter(id => id != null),
        productId: event.product_id,
        store: event.store,
        environment: event.environment,
        expirationAtMs: event.expiration_at_ms,
        purchasedAtMs: event.purchased_at_ms,
      })
      logger.withFields({
        type: event.type,
        id: event.id,
        userId: event.app_user_id,
        synced: result.synced,
      }).log('Processed subscription event')
      return { received: true, synced: result.synced }
    }

    if (event.type !== FLUX_GRANT_EVENT) {
      logger.withFields({ type: event.type, id: event.id }).log('Ignoring webhook event')
      return { received: true }
    }

    if (!event.app_user_id || !event.product_id || !event.transaction_id) {
      logger.withFields({ id: event.id }).warn('Non-renewing purchase is missing identifiers')
      return { received: true }
    }

    const pack = await resolveRevenuecatPack(configKV, event.product_id)
    if (!pack) {
      logger.withFields({ id: event.id, productId: event.product_id }).warn('RevenueCat product is unknown')
      return { received: true }
    }

    const result = await payment.settle(evidenceReceiptFromEvent(event, event.app_user_id, pack, {
      productId: event.product_id,
      transactionId: event.transaction_id,
    }))
    logger.withFields({
      userId: event.app_user_id,
      transactionId: event.transaction_id,
      productId: event.product_id,
      applied: result.applied,
      balanceAfter: result.applied ? result.balanceAfter : undefined,
    }).log('Processed RevenueCat pack purchase')

    return { received: true, granted: result.applied }
  }
}
