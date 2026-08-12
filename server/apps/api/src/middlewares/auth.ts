import type { MiddlewareHandler } from 'hono'

import type { Database } from '../libs/db'
import type { Env } from '../libs/env'
import type { HonoEnv } from '../types/hono'

import { resolveRequestAuth } from '../libs/request-auth'
import { createUnauthorizedError } from '../utils/error'

/**
 * Session middleware injects the user and session into the Hono context.
 * It does not block unauthorized requests.
 */
export function sessionMiddleware(db: Database, env: Env): MiddlewareHandler<HonoEnv> {
  return async (c, next) => {
    // Admin UI routes are public redirects. Authorization is enforced by the
    // API endpoints they call, so avoid unnecessary token work here.
    if (
      c.req.path.startsWith('/admin/')
      || c.req.path === '/admin'
    ) {
      c.set('user', null)
      c.set('session', null)
      return await next()
    }

    const session = await resolveRequestAuth(db, env, c.req.raw.headers)

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
    throw createUnauthorizedError()
  }
  await next()
}
