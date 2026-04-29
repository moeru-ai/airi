import type { MiddlewareHandler } from 'hono'

import type { createAuth } from '../libs/auth'
import type { Env } from '../libs/env'
import type { HonoEnv } from '../types/hono'

import { resolveRequestAuth } from '../libs/request-auth'
import { createUnauthorizedError } from '../utils/error'

type AuthInstance = ReturnType<typeof createAuth>

/**
 * Session middleware injects the user and session into the Hono context.
 * It does not block unauthorized requests.
 */
export function sessionMiddleware(auth: AuthInstance, env: Env): MiddlewareHandler<HonoEnv> {
  return async (c, next) => {
    // NOTICE: auth routes handle session lookup inside better-auth itself,
    // and the ui-server-auth SPA bundle (HTML/JS/CSS + SPA routes like
    // `/auth/sign-in`, `/auth/verify-email`, …) doesn't need a session
    // attached either. Running the global session middleware on `/api/auth/*`,
    // `/auth/*`, and the auth discovery endpoints duplicates the same session
    // read and slows the OIDC login path (`authorize` → `token` →
    // `get-session`) noticeably.
    //
    // `/auth/` and `/api/auth/` are distinct prefixes — `/api/auth/...`
    // starts with `/api` and won't be matched by the `/auth/` startsWith.
    if (
      c.req.path.startsWith('/auth/')
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
