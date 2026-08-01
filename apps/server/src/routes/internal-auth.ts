import type { ProductEventService } from '../services/domain/product-events'
import type { UserDeletionExecutor, UserDeletionReason } from '../services/domain/user-deletion'
import type { HonoEnv } from '../types/hono'

import { Buffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'

import { Hono } from 'hono'
import { nonEmpty, object, picklist, pipe, safeParse, string, trim } from 'valibot'

const UserDeletionRequestSchema = object({
  userId: pipe(string(), trim(), nonEmpty()),
  reason: picklist(['user-requested', 'admin', 'compliance']),
})

const AuthEventRequestSchema = object({
  userId: pipe(string(), trim(), nonEmpty()),
  action: picklist(['user_signed_up', 'session_started']),
  source: picklist(['better-auth.user.create', 'better-auth.session.create']),
})

function hasValidInternalCredential(authorization: string | undefined, expected: string): boolean {
  if (!expected || !authorization?.startsWith('Bearer '))
    return false

  const actual = Buffer.from(authorization.slice(7))
  const wanted = Buffer.from(expected)
  return actual.length === wanted.length && timingSafeEqual(actual, wanted)
}

/**
 * Internal boundary called by the Auth service before credentials are
 * hard-deleted. It owns no login behavior; it only coordinates API-owned data.
 */
export function createInternalAuthRoutes(input: {
  secret: string
  userDeletionService: UserDeletionExecutor
  productEventService: Pick<ProductEventService, 'track'>
}) {
  return new Hono<HonoEnv>()
    .post('/user-deletion', async (c) => {
      if (!input.secret) {
        return c.json({ error: 'AUTH_INTERNAL_AUTH_NOT_CONFIGURED' }, 503)
      }
      if (!hasValidInternalCredential(c.req.header('authorization'), input.secret))
        return c.json({ error: 'UNAUTHORIZED' }, 401)

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
      if (!input.secret)
        return c.json({ error: 'AUTH_INTERNAL_AUTH_NOT_CONFIGURED' }, 503)
      if (!hasValidInternalCredential(c.req.header('authorization'), input.secret))
        return c.json({ error: 'UNAUTHORIZED' }, 401)

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
