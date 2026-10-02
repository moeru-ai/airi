import type { ProductEventService } from '../services/domain/product-events'
import type { UserDeletionExecutor, UserDeletionReason } from '../services/domain/user-deletion'
import type { HonoEnv } from '../types/hono'

import { Hono } from 'hono'
import { nonEmpty, object, picklist, pipe, safeParse, string, trim } from 'valibot'

const UserDeletionRequestSchema = object({
  userId: pipe(string(), trim(), nonEmpty()),
  reason: picklist(['user-requested', 'admin', 'compliance']),
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
}) {
  return new Hono<HonoEnv>()
    .post('/user-deletion', async (c) => {
      const parsed = safeParse(UserDeletionRequestSchema, await c.req.json().catch(() => null))
      if (!parsed.success)
        return c.json({ error: 'BAD_REQUEST', message: 'Invalid user deletion request' }, 400)

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
        return c.json({ error: 'BAD_REQUEST', message: 'Invalid auth event' }, 400)

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
