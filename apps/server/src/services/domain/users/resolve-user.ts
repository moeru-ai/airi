import type { Database } from '../../../libs/db'

import { eq } from 'drizzle-orm'

import { createNotFoundError } from '../../../utils/error'

import * as accountsSchema from '../../../schemas/accounts'

export interface UserSelector {
  /** Select by user id. Exactly one of `userId` / `email` must be set. */
  userId?: string
  /** Select by email (case-insensitive). Exactly one of `userId` / `email` must be set. */
  email?: string
}

/**
 * Resolve an admin-supplied selector to a concrete user row.
 *
 * Use when:
 * - An admin operation targets a single user by id or email and needs the
 *   canonical `{ id, email }` before mutating balance, bans, etc.
 *
 * Expects:
 * - Exactly one of `userId` / `email` is set. `email` is matched lowercased,
 *   which is safe because better-auth stores emails lowercased and the unique
 *   index is on the raw column (wrapping in `LOWER()` would seq-scan).
 *
 * Returns:
 * - `{ id, email }` of the matching user.
 *
 * Throws:
 * - 404 when no user matches the selector.
 */
export async function resolveUserByIdOrEmail(
  db: Database,
  selector: UserSelector,
): Promise<{ id: string, email: string }> {
  if (selector.userId != null) {
    const [row] = await db
      .select({ id: accountsSchema.user.id, email: accountsSchema.user.email })
      .from(accountsSchema.user)
      .where(eq(accountsSchema.user.id, selector.userId))
      .limit(1)
    if (!row)
      throw createNotFoundError(`No user with id ${selector.userId}`)
    return row
  }

  const email = selector.email!.toLowerCase()
  const [row] = await db
    .select({ id: accountsSchema.user.id, email: accountsSchema.user.email })
    .from(accountsSchema.user)
    .where(eq(accountsSchema.user.email, email))
    .limit(1)
  if (!row)
    throw createNotFoundError(`No user with email ${email}`)
  return row
}
