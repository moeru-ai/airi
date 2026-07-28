import type { Database } from '../../../libs/db'

import { and, eq } from 'drizzle-orm'

import { account } from '../../../schemas/accounts'

const STEAM_PROVIDER_ID = 'steam'

/**
 * Resolves the AIRI user a SteamID is currently linked to, without creating one.
 *
 * Use when:
 * - The Steam sign-in endpoint needs to decide between silent login (linked)
 *   and the enrollment handoff (unlinked).
 *
 * Returns:
 * - `{ userId }` when a `steam` account row exists for this steamId, else `null`.
 */
export async function findLinkedSteamUser(
  db: Database,
  steamId: string,
): Promise<{ userId: string } | null> {
  const [existingAccount] = await db
    .select({ userId: account.userId })
    .from(account)
    .where(and(
      eq(account.providerId, STEAM_PROVIDER_ID),
      eq(account.accountId, steamId),
    ))
    .limit(1)

  return existingAccount ? { userId: existingAccount.userId } : null
}

/**
 * Whether this AIRI user already has any Steam account linked.
 *
 * Used by the authorize enroll choke point so a second hit with an already
 * consumed enrollToken (email success tab + pending tab) can still issue a
 * code after the first request linked Steam.
 */
export async function userHasLinkedSteam(
  db: Database,
  userId: string,
): Promise<boolean> {
  const [existingAccount] = await db
    .select({ userId: account.userId })
    .from(account)
    .where(and(
      eq(account.providerId, STEAM_PROVIDER_ID),
      eq(account.userId, userId),
    ))
    .limit(1)

  return Boolean(existingAccount)
}
