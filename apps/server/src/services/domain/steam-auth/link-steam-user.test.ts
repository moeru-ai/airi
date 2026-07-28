import type { Database } from '../../../libs/db'

import { randomUUID } from 'node:crypto'

import { and, eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { mockDB } from '../../../libs/mock-db'
import { account, user } from '../../../schemas/accounts'
import { linkSteamToUser } from './link-steam-user'

import * as schema from '../../../schemas'

async function createUser(db: Database, overrides: Partial<{ name: string, image: string | null }> = {}) {
  const id = randomUUID()
  await db.insert(user).values({
    id,
    name: overrides.name ?? '',
    email: `${id}@example.com`,
    emailVerified: true,
    image: overrides.image ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  return id
}

describe('linkSteamToUser', () => {
  let db: Database

  // NOTICE: mockDB pushSchema is slow on cold CI runners; share one DB per file.
  beforeAll(async () => {
    db = await mockDB(schema)
  }, 30_000)

  beforeEach(async () => {
    await db.delete(account)
    await db.delete(user)
  })

  it('inserts a steam account row for the user', async () => {
    const userId = await createUser(db, { name: ' Existing', image: null })

    await linkSteamToUser(db, { userId, steamId: '76561198000000030', profile: { name: 'SteamName', image: 'https://x/a.jpg' } })

    const accounts = await db.select().from(account).where(and(eq(account.providerId, 'steam'), eq(account.accountId, '76561198000000030')))
    expect(accounts).toHaveLength(1)
    expect(accounts[0]?.userId).toBe(userId)
  })

  it('backfills name and image only when the user fields are empty', async () => {
    const userId = await createUser(db, { name: '', image: null })

    await linkSteamToUser(db, { userId, steamId: '76561198000000031', profile: { name: 'Alice', image: 'https://x/a.jpg' } })

    const users = await db.select().from(user).where(eq(user.id, userId))
    expect(users[0]?.name).toBe('Alice')
    expect(users[0]?.image).toBe('https://x/a.jpg')
  })

  it('does not overwrite an existing name or image', async () => {
    const userId = await createUser(db, { name: 'KeptName', image: 'https://x/old.jpg' })

    await linkSteamToUser(db, { userId, steamId: '76561198000000032', profile: { name: 'Alice', image: 'https://x/new.jpg' } })

    const users = await db.select().from(user).where(eq(user.id, userId))
    expect(users[0]?.name).toBe('KeptName')
    expect(users[0]?.image).toBe('https://x/old.jpg')
  })

  it('is idempotent when the steamId is already linked', async () => {
    const userId = await createUser(db)

    await linkSteamToUser(db, { userId, steamId: '76561198000000033', profile: null })
    await linkSteamToUser(db, { userId, steamId: '76561198000000033', profile: { name: 'Ignored', image: 'https://x/a.jpg' } })

    const accounts = await db.select().from(account).where(and(eq(account.providerId, 'steam'), eq(account.accountId, '76561198000000033')))
    expect(accounts).toHaveLength(1)
  })

  // https://github.com/moeru-ai/airi/pull/1966#discussion_r3600204294
  it('rejects a SteamID that belongs to another user for PR #1966', async () => {
    const ownerUserId = await createUser(db)
    const otherUserId = await createUser(db)
    const steamId = '76561198000000034'

    await linkSteamToUser(db, { userId: ownerUserId, steamId, profile: null })

    // ROOT CAUSE:
    //
    // The existing-account lookup selected only the row ID and treated every
    // match as an idempotent retry, even when another AIRI user owned the row.
    //
    // Before the fix, this call resolved successfully.
    //
    // We fixed this by selecting the owner and accepting only same-user retries.
    await expect(linkSteamToUser(db, {
      userId: otherUserId,
      steamId,
      profile: null,
    })).rejects.toThrow('Steam account is already linked to another user')

    const accounts = await db
      .select({ userId: account.userId })
      .from(account)
      .where(and(eq(account.providerId, 'steam'), eq(account.accountId, steamId)))

    expect(accounts).toHaveLength(1)
    expect(accounts[0]?.userId).toBe(ownerUserId)
  })
})
