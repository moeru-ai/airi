import type { MiddlewareHandler } from 'hono'

import type { createAuth } from '../libs/auth'
import type { Env } from '../libs/env'
import type { HonoEnv } from '../types/hono'

import { useLogger } from '@guiiai/logg'

import { resolveRequestAuth } from '../libs/request-auth'
import { createUnauthorizedError } from '../utils/error'

const logger = useLogger('auth')

type AuthInstance = ReturnType<typeof createAuth>

/**
 * Session middleware injects the user and session into the Hono context.
 * It does not block unauthorized requests.
 *
 * Use when: mounting globally before route guards to populate `c.get('user')`.
 *
 * Expects:
 * - `auth` to verify the request session (via {@link resolveRequestAuth}).
 * - The soft-delete invariant in `POST /api/v1/user/delete` to be upheld:
 *   the same transaction that sets `user.deletedAt` also wipes every
 *   `session` and OIDC issued-token row for that user. Therefore, by the
 *   time a request arrives, no live session can belong to a soft-deleted
 *   user — and we do not need an extra `SELECT deletedAt FROM user`
 *   round-trip on every request.
 *
 * Returns: middleware that sets `user`/`session` on the Hono context, or
 * leaves them `null` for anonymous traffic. Blocking is done by `authGuard`.
 */
export function sessionMiddleware(auth: AuthInstance, env: Env): MiddlewareHandler<HonoEnv> {
  return async (c, next) => {
    // NOTICE:
    // Auth routes handle session lookup inside better-auth itself.
    // Running the global session middleware on `/api/auth/*`, `/sign-in`, and
    // the auth discovery endpoints duplicates the same session read and slows
    // the OIDC login path (`authorize` → `token` → `get-session`) noticeably.
    if (
      c.req.path === '/sign-in'
      || c.req.path.startsWith('/api/auth/')
      || c.req.path === '/.well-known/oauth-authorization-server/api/auth'
    ) {
      c.set('user', null)
      c.set('session', null)
      return await next()
    }

    const session = await resolveRequestAuth(auth, env, c.req.raw.headers)

    if (!session) {
      c.set('user', null)
      c.set('session', null)
      return await next()
    }

    // NOTICE:
    // We deliberately do NOT re-check `user.deletedAt` here. The soft-delete
    // path is transactional (see `POST /api/v1/user/delete` in
    // `routes/user/index.ts`): user.deletedAt is set together with
    // `DELETE FROM session WHERE user_id = ?`. So a session whose row
    // survived to this point belongs to a non-deleted user by construction,
    // and the previous extra SELECT was pure overhead on the hot request
    // path.
    // Removal condition: if soft-delete ever stops cascading to sessions
    // (e.g. async cleanup), restore the deletedAt check here.
    c.set('user', session.user)
    c.set('session', session.session)
    await next()
  }
}

/**
 * Auth guard middleware blocks requests if the user is not authenticated.
 * Must be used after sessionMiddleware.
 */
export const authGuard: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const user = c.get('user')
  if (!user) {
    logger.withFields({ path: c.req.path, method: c.req.method }).debug('Unauthorized request blocked')
    throw createUnauthorizedError()
  }
  await next()
}
