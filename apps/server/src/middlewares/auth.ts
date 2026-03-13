import type { MiddlewareHandler } from 'hono'

import type { createAuth } from '../libs/auth'
import type { HonoEnv } from '../types/hono'

import { useLogger } from '@guiiai/logg'

import { createUnauthorizedError } from '../utils/error'

const logger = useLogger('auth')

type AuthInstance = ReturnType<typeof createAuth>

/**
 * Session middleware injects the user and session into the Hono context.
 * It does not block unauthorized requests.
 */
export function sessionMiddleware(auth: AuthInstance): MiddlewareHandler<HonoEnv> {
  return async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers })

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
    logger.withFields({ path: c.req.path, method: c.req.method }).warn('Unauthorized request blocked')
    throw createUnauthorizedError()
  }
  await next()
}
