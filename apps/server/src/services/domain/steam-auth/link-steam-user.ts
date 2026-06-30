import type { Database } from '../../../libs/db'
import type { SteamProfile } from './enrollment-token'

import { randomUUID } from 'node:crypto'

import { and, eq } from 'drizzle-orm'

import { account, user } from '../../../schemas/accounts'

const STEAM_PROVIDER_ID = 'steam'

/**
 * Links a verified SteamID to an already-authenticated AIRI user.
 *
 * Use when:
 * - The OIDC authorize choke point has consumed a valid enrollment token and
 *   resolved the session user; linking happens atomically with code issuance.
 *
 * Idempotent: if a `steam` account row already exists for this steamId
 * (linked to any user), the insert + profile backfill are skipped. This
 * closes the race where a second enrollment attempt converges on a steamId
 * that a concurrent request already linked.
 *
 * Profile application: nickname/avatar are written ONLY to user fields that
 * are currently empty (the 2026-06-13 "write-if-empty" semantics), so
 * enrolling never clobbers an existing identity.
 */
export async function linkSteamToUser(
  db: Database,
  params: { userId: string, steamId: string, profile?: SteamProfile | null },
): Promise<void> {
  const [existing] = await db
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.providerId, STEAM_PROVIDER_ID), eq(account.accountId, params.steamId)))
    .limit(1)

  if (existing)
    return

  const now = new Date()
  await db.insert(account).values({
    id: randomUUID(),
    accountId: params.steamId,
    providerId: STEAM_PROVIDER_ID,
    userId: params.userId,
    createdAt: now,
    updatedAt: now,
  })

  if (params.profile)
    await backfillProfileIfEmpty(db, params.userId, params.profile)
}

async function backfillProfileIfEmpty(db: Database, userId: string, profile: SteamProfile): Promise<void> {
  const [current] = await db
    .select({ name: user.name, image: user.image })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  if (!current)
    return

  const updates: Partial<{ name: string, image: string }> = {}
  if ((!current.name || current.name.trim() === '') && profile.name)
    updates.name = profile.name
  if (!current.image && profile.image)
    updates.image = profile.image

  if (Object.keys(updates).length === 0)
    return

  await db.update(user).set({ ...updates, updatedAt: new Date() }).where(eq(user.id, userId))
}
