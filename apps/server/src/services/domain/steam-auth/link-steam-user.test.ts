import { randomUUID } from 'node:crypto'

import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { mockDB } from '../../../libs/mock-db'
import { account, user } from '../../../schemas/accounts'
import { linkSteamToUser } from './link-steam-user'

import * as schema from '../../../schemas'

async function createUser(db: Awaited<ReturnType<typeof mockDB>>, overrides: Partial<{ name: string, image: string | null }> = {}) {
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
  it('inserts a steam account row for the user', async () => {
    const db = await mockDB(schema)
    const userId = await createUser(db, { name: ' Existing', image: null })

    await linkSteamToUser(db, { userId, steamId: '76561198000000030', profile: { name: 'SteamName', image: 'https://x/a.jpg' } })

    const accounts = await db.select().from(account).where(and(eq(account.providerId, 'steam'), eq(account.accountId, '76561198000000030')))
    expect(accounts).toHaveLength(1)
    expect(accounts[0]?.userId).toBe(userId)
  })

  it('backfills name and image only when the user fields are empty', async () => {
    const db = await mockDB(schema)
    const userId = await createUser(db, { name: '', image: null })

    await linkSteamToUser(db, { userId, steamId: '76561198000000031', profile: { name: 'Alice', image: 'https://x/a.jpg' } })

    const users = await db.select().from(user).where(eq(user.id, userId))
    expect(users[0]?.name).toBe('Alice')
    expect(users[0]?.image).toBe('https://x/a.jpg')
  })

  it('does not overwrite an existing name or image', async () => {
    const db = await mockDB(schema)
    const userId = await createUser(db, { name: 'KeptName', image: 'https://x/old.jpg' })

    await linkSteamToUser(db, { userId, steamId: '76561198000000032', profile: { name: 'Alice', image: 'https://x/new.jpg' } })

    const users = await db.select().from(user).where(eq(user.id, userId))
    expect(users[0]?.name).toBe('KeptName')
    expect(users[0]?.image).toBe('https://x/old.jpg')
  })

  it('is idempotent when the steamId is already linked', async () => {
    const db = await mockDB(schema)
    const userId = await createUser(db)

    await linkSteamToUser(db, { userId, steamId: '76561198000000033', profile: null })
    await linkSteamToUser(db, { userId, steamId: '76561198000000033', profile: { name: 'Ignored', image: 'https://x/a.jpg' } })

    const accounts = await db.select().from(account).where(and(eq(account.providerId, 'steam'), eq(account.accountId, '76561198000000033')))
    expect(accounts).toHaveLength(1)
  })
})
