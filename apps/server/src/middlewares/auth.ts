import type { MiddlewareHandler } from 'hono'

import type { createAuth } from '../libs/auth'
import type { Database } from '../libs/db'
import type { HonoEnv } from '../types/hono'

import { useLogger } from '@guiiai/logg'

import { resolveRequestAuth } from '../libs/request-auth'
import { createUnauthorizedError } from '../utils/error'

const logger = useLogger('auth')

type AuthInstance = ReturnType<typeof createAuth>

/**
 * Session middleware injects the user and session into the Hono context.
 * It does not block unauthorized requests.
 */
export function sessionMiddleware(auth: AuthInstance, db: Database): MiddlewareHandler<HonoEnv> {
  return async (c, next) => {
    // NOTICE: auth routes handle session lookup inside better-auth itself.
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

    const session = await resolveRequestAuth(auth, db, c.req.raw.headers)

    if (!session) {
      c.set('user', null)
      c.set('session', null)
      return await next()
    }

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
