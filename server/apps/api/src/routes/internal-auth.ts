import type { RevenuecatSubscriberClient } from '../services/adapters/revenuecat-subscriber'
import type { ProductEventService } from '../services/domain/product-events'
import type { UserDeletionExecutor, UserDeletionReason } from '../services/domain/user-deletion'
import type { HonoEnv } from '../types/hono'

import { createBadRequestError, createSubscriptionActiveError } from '@proj-airi/http-error-shared'
import { Hono } from 'hono'
import { nonEmpty, object, picklist, pipe, safeParse, string, trim } from 'valibot'

const UserDeletionRequestSchema = object({
  userId: pipe(string(), trim(), nonEmpty()),
  reason: picklist(['user-requested', 'admin', 'compliance']),
})

const UserDeletionCheckRequestSchema = object({
  userId: pipe(string(), trim(), nonEmpty()),
})

const AuthEventRequestSchema = object({
  userId: pipe(string(), trim(), nonEmpty()),
  action: picklist(['user_signed_up']),
  source: picklist(['better-auth.user.create']),
})

/**
 * Internal boundary called by the Auth service before credentials are
 * hard-deleted. Deployment must keep this route on the private service network
 * and block `/internal/*` at the public edge.
 */
export function createInternalAuthRoutes(input: {
  userDeletionService: UserDeletionExecutor
  productEventService: Pick<ProductEventService, 'track'>
  revenuecatSubscriber: Pick<RevenuecatSubscriberClient, 'hasRenewingSubscription'>
}) {
  return new Hono<HonoEnv>()
    // Auth asks this before it sends the deletion email, and again before it revokes
    // external authorizations. The check changes nothing, so a refusal leaves the account whole.
    // A deleted user cannot open the management URL, so a subscription that can still charge refuses.
    .post('/user-deletion/check', async (c) => {
      const parsed = safeParse(UserDeletionCheckRequestSchema, await c.req.json().catch(() => null))
      if (!parsed.success)
        throw createBadRequestError('Invalid user deletion check')

      if (await input.revenuecatSubscriber.hasRenewingSubscription(parsed.output.userId))
        throw createSubscriptionActiveError()
      return c.json({ deletable: true })
    })
    .post('/user-deletion', async (c) => {
      const parsed = safeParse(UserDeletionRequestSchema, await c.req.json().catch(() => null))
      if (!parsed.success)
        throw createBadRequestError('Invalid user deletion request')

      const request = parsed.output
      await input.userDeletionService.softDeleteAll({
        userId: request.userId,
        reason: request.reason as UserDeletionReason,
      })
      return c.json({ success: true })
    })
    .post('/events', async (c) => {
      const parsed = safeParse(AuthEventRequestSchema, await c.req.json().catch(() => null))
      if (!parsed.success)
        throw createBadRequestError('Invalid auth event')

      await input.productEventService.track({
        userId: parsed.output.userId,
        feature: 'auth',
        action: parsed.output.action,
        status: 'succeeded',
        source: parsed.output.source,
      })
      return c.json({ success: true })
    })
}
