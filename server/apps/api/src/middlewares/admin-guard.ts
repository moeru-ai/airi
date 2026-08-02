import type { MiddlewareHandler } from 'hono'

import type { HonoEnv } from '../types/hono'

import { createForbiddenError, createUnauthorizedError } from '../utils/error'

/**
 * Role that grants access to `/api/admin/*`. Matches the better-auth `admin`
 * plugin's default `adminRoles`. `user.role` may be a comma-separated list, so
 * membership is tested per-entry.
 */
const ADMIN_ROLE = 'admin'

/**
 * Block requests that aren't from an admin-role user.
 *
 * Use when:
 * - Mounting `/api/admin/*` routes that mutate flux balances, router config,
 *   or other privileged state.
 *
 * Expects:
 * - `sessionMiddleware` already populated `c.get('user')` (or null for
 *   anonymous requests). The user carries `role` from the better-auth `admin`
 *   plugin schema.
 *
 * Returns:
 * - `401 UNAUTHORIZED` when no session user is present
 * - `403 FORBIDDEN` when the user has no `admin` role
 *
 * Roles are granted out-of-band (manual DB update / better-auth `/admin/set-role`
 * which is currently disabled), so there is no env allowlist.
 */
export const adminGuard: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const user = c.get('user')
  if (!user)
    throw createUnauthorizedError('Authentication required')

  const roles = (user.role ?? '').split(',').map(r => r.trim())
  if (!roles.includes(ADMIN_ROLE))
    throw createForbiddenError('Admin access required')

  await next()
}
