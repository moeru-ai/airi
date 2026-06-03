import type { Database } from '../../libs/db'

import { and, eq } from 'drizzle-orm'
import { email, nonEmpty, object, pipe, safeParse, string, transform } from 'valibot'

import { account, user } from '../../schemas/accounts'
import { createBadRequestError } from '../../utils/error'

const CheckEmailIdentifierBodySchema = object({
  email: pipe(
    string(),
    transform(value => value.trim().toLowerCase()),
    nonEmpty('email is required'),
    email('email must be a valid email address'),
  ),
})

export interface CheckEmailIdentifierDeps {
  /** Database used to inspect user and credential-account rows. */
  db: Database
}

export interface CheckEmailIdentifierResult {
  /** Whether a user row exists for the normalized email. */
  exists: boolean
  /** Whether the matching user can sign in with email and password. */
  hasPassword: boolean
}

/**
 * Checks whether an email belongs to an existing credential-capable account.
 *
 * Use when:
 * - The auth UI needs to choose between password sign-in, account creation,
 *   or social-provider guidance.
 *
 * Expects:
 * - Raw body shape from `/api/auth/check-email`.
 *
 * Returns:
 * - Existence and credential-account flags for the normalized email.
 */
export async function checkEmailIdentifier(
  deps: CheckEmailIdentifierDeps,
  body: { email?: unknown } | null,
): Promise<CheckEmailIdentifierResult> {
  const parsed = safeParse(CheckEmailIdentifierBodySchema, body)
  if (!parsed.success)
    throw createBadRequestError('Invalid email', 'INVALID_EMAIL')

  const [matched] = await deps.db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, parsed.output.email))
    .limit(1)

  if (!matched)
    return { exists: false, hasPassword: false }

  const [credential] = await deps.db
    .select({ id: account.id })
    .from(account)
    .where(and(
      eq(account.userId, matched.id),
      eq(account.providerId, 'credential'),
    ))
    .limit(1)

  return { exists: true, hasPassword: !!credential }
}
