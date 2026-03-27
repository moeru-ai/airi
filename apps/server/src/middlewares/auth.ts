import type { MiddlewareHandler } from 'hono'

import type { AuthInstance } from '../libs/auth'
import type { HonoEnv } from '../types/hono'

import { useLogger } from '@guiiai/logg'

import { createUnauthorizedError } from '../utils/error'

const logger = useLogger('auth')

/**
 * Session middleware extracts the JWT access token from the Authorization header
 * and injects the user into the Hono context.
 * It does not block unauthorized requests.
 */
export function sessionMiddleware(auth: AuthInstance): MiddlewareHandler<HonoEnv> {
  return async (c, next) => {
    const authHeader = c.req.header('Authorization')

    if (!authHeader?.startsWith('Bearer ')) {
      c.set('user', null)
      return await next()
    }

    const token = authHeader.slice(7)
    const payload = await auth.verifyAccessToken(token)

    if (!payload) {
      c.set('user', null)
      return await next()
    }

    const user = await auth.getUserById(payload.sub)
    if (!user) {
      c.set('user', null)
      return await next()
    }

    c.set('user', user)
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
