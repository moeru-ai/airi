import type { Database } from '../../../libs/db'

import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'

import { verification } from '../../../schemas/accounts'

// NOTICE:
// Enrollment tokens reuse better-auth's `verification` table (no new table, per
// the enrollment spec). The row `id` is the single-use token handed to Electron;
// `identifier` carries the steamId under a reserved prefix; `value` carries the
// Steam profile JSON so the authorize choke point can backfill the user without
// re-fetching from Steam. Removal condition: a dedicated enrollment store is
// introduced (then migrate both columns).
const ENROLLMENT_IDENTIFIER_PREFIX = 'steam-enroll:'
const ENROLLMENT_TOKEN_TTL_MS = 10 * 60 * 1000

export interface SteamProfile {
  name: string
  image: string
}

export interface EnrollmentTokenPayload {
  steamId: string
  profile: SteamProfile | null
}

/**
 * Creates a single-use enrollment token binding a verified steamId to its
 * best-effort Steam profile.
 *
 * Use when:
 * - The Steam sign-in endpoint has verified a ticket + ownership for an
 *   unlinked steamId and must hand the browser a token to complete linking.
 *
 * Returns:
 * - The token string (the `verification` row id) Electron encodes into the
 *   enroll page URL.
 */
export async function createEnrollmentToken(
  db: Database,
  payload: EnrollmentTokenPayload,
): Promise<string> {
  const id = randomUUID()
  const now = new Date()
  const identifier = `${ENROLLMENT_IDENTIFIER_PREFIX}${payload.steamId}`

  // Re-issuing replaces any prior unused token for this steamId so the user can
  // click Sign in again without leaving stale rows. `value` must stay unique
  // across the better-auth `verification_value` constraint — the same Steam
  // profile JSON alone collides on every retry (see Railway 23505).
  await db.delete(verification).where(eq(verification.identifier, identifier))

  await db.insert(verification).values({
    id,
    identifier,
    // NOTICE:
    // Why: production `verification.value` is UNIQUE (better-auth).
    // Root cause: storing only `{ profile }` made every re-enroll of the same
    // Steam account insert an identical value and fail with SQLSTATE 23505.
    // Removal condition: drop `verification_value` uniqueness, or move enrollment
    // off the verification table.
    value: JSON.stringify({ profile: payload.profile, jti: id }),
    expiresAt: new Date(now.getTime() + ENROLLMENT_TOKEN_TTL_MS),
    createdAt: now,
    updatedAt: now,
  })
  return id
}

/**
 * Atomically consumes a single-use enrollment token.
 *
 * Use when:
 * - The OIDC authorize choke point resolves the authenticated session and is
 *   about to issue a code; it consumes the token and links Steam first.
 *
 * The DELETE-RETURNING makes consumption single-use across concurrent
 * requests; expiry + identifier prefix are validated post-delete so an
 * already-used / expired / foreign token resolves to `null`.
 *
 * Returns:
 * - The bound `{ steamId, profile }` when the token was valid and is now
 *   consumed, else `null` (row already gone, expired, or not an enrollment
 *   token). In all non-null cases the row is deleted.
 */
export async function consumeEnrollmentToken(
  db: Database,
  token: string,
): Promise<EnrollmentTokenPayload | null> {
  const deleted = await db
    .delete(verification)
    .where(eq(verification.id, token))
    .returning({
      identifier: verification.identifier,
      value: verification.value,
      expiresAt: verification.expiresAt,
    })

  const row = deleted[0]
  if (!row)
    return null
  if (new Date(row.expiresAt).getTime() <= Date.now())
    return null
  if (!row.identifier.startsWith(ENROLLMENT_IDENTIFIER_PREFIX))
    return null

  const steamId = row.identifier.slice(ENROLLMENT_IDENTIFIER_PREFIX.length)
  let profile: SteamProfile | null = null
  try {
    const parsed = JSON.parse(row.value) as { profile?: unknown }
    if (parsed.profile && typeof parsed.profile === 'object')
      profile = parsed.profile as SteamProfile
  }
  catch {
    profile = null
  }
  return { steamId, profile }
}
