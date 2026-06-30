import type { Database } from '../../../libs/db'

import { randomUUID } from 'node:crypto'

import { and, eq } from 'drizzle-orm'

import { getPlayerSummaries } from '../../../libs/steam-web-api'
import { account, user } from '../../../schemas/accounts'

const STEAM_PROVIDER_ID = 'steam'

/**
 * Stable placeholder email for Steam-only accounts.
 *
 * Before:
 * - steamId `76561198000000001`
 *
 * After:
 * - `76561198000000001@steam.local`
 */
export function steamPlaceholderEmail(steamId: string): string {
  return `${steamId}@steam.local`
}

export async function resolveOrCreateSteamUser(
  db: Database,
  steamId: string,
  options?: {
    publisherKey?: string
    getPlayerSummaries?: typeof getPlayerSummaries
  },
): Promise<{ userId: string, created: boolean }> {
  const [existingAccount] = await db
    .select({ userId: account.userId })
    .from(account)
    .where(and(
      eq(account.providerId, STEAM_PROVIDER_ID),
      eq(account.accountId, steamId),
    ))
    .limit(1)

  if (existingAccount)
    return { userId: existingAccount.userId, created: false }

  const profile = options?.publisherKey
    ? await (options.getPlayerSummaries ?? getPlayerSummaries)({
        publisherKey: options.publisherKey,
        steamId,
      })
    : null

  const userId = randomUUID()
  const now = new Date()

  await db.insert(user).values({
    id: userId,
    name: profile?.name || 'Steam User',
    email: steamPlaceholderEmail(steamId),
    emailVerified: true,
    image: profile?.image || null,
    createdAt: now,
    updatedAt: now,
  })

  await db.insert(account).values({
    id: randomUUID(),
    accountId: steamId,
    providerId: STEAM_PROVIDER_ID,
    userId,
    createdAt: now,
    updatedAt: now,
  })

  return { userId, created: true }
}
