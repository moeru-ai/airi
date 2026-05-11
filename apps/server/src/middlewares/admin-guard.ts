import type { MiddlewareHandler } from 'hono'

import type { Env } from '../libs/env'
import type { HonoEnv } from '../types/hono'

import { createForbiddenError, createUnauthorizedError } from '../utils/error'

/**
 * Parse the comma-separated `ADMIN_EMAILS` env var into a normalized Set.
 *
 * Use when:
 * - You need a fast in-memory lookup of admin emails
 *
 * Returns:
 * - Set of trimmed, lowercased, non-empty email addresses. Empty set when the
 *   env var is unset or contains only whitespace, which is the production-safe
 *   default (no one is admin).
 *
 * Before:
 * - "  Alice@Example.com , bob@example.com ,, "
 *
 * After:
 * - Set { "alice@example.com", "bob@example.com" }
 */
export function parseAdminEmails(raw: string): Set<string> {
  return new Set(
    raw
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean),
  )
}

/**
 * Block requests that aren't from a verified admin user.
 *
 * Use when:
 * - Mounting `/api/admin/*` routes that mutate flux balances or other
 *   privileged state
 *
 * Expects:
 * - `sessionMiddleware` already populated `c.get('user')` (or set it to null
 *   for anonymous requests)
 * - `env.ADMIN_EMAILS` is a comma-separated allowlist of email addresses
 *
 * Returns:
 * - `401 UNAUTHORIZED` when no session user is present
 * - `403 FORBIDDEN` when the user is signed in but their email is not in the
 *   allowlist, OR their email is not yet verified. The latter guards against
 *   a fresh email/password signup with an admin's address slipping past the
 *   check before they verify ownership.
 *
 * Future: when a `role` column is added to `user`, replace the env-var
 * lookup with a `user.role === 'admin'` check. The middleware contract
 * stays the same; only the predicate changes.
 */
export function adminGuard(env: Env): MiddlewareHandler<HonoEnv> {
  const adminEmails = parseAdminEmails(env.ADMIN_EMAILS)

  return async (c, next) => {
    const user = c.get('user')
    if (!user)
      throw createUnauthorizedError('Authentication required')

    if (!user.emailVerified)
      throw createForbiddenError('Admin access requires a verified email')

    if (!adminEmails.has(user.email.toLowerCase()))
      throw createForbiddenError('Admin access required')

    await next()
  }
}
