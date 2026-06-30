import { describe, expect, it } from 'vitest'

import { mockDB } from '../../../libs/mock-db'
import { account, user } from '../../../schemas/accounts'
import { findLinkedSteamUser } from './resolve-steam-user'

import * as schema from '../../../schemas'

// `account.userId` has a FK to `user.id` (ON DELETE CASCADE), enforced by
// PGlite, so every positive-case account insert needs a parent user row first.
async function createUserRow(db: Awaited<ReturnType<typeof mockDB>>, id: string): Promise<void> {
  await db.insert(user).values({
    id,
    name: '',
    email: `${id}@example.com`,
    emailVerified: true,
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
}

describe('findLinkedSteamUser', () => {
  it('returns null when no steam account is linked', async () => {
    const db = await mockDB(schema)
    expect(await findLinkedSteamUser(db, '76561198000000040')).toBeNull()
  })

  it('returns the userId when a steam account is linked', async () => {
    const db = await mockDB(schema)
    await createUserRow(db, 'user-linked')
    await db.insert(account).values({
      id: 'acc-1',
      accountId: '76561198000000041',
      providerId: 'steam',
      userId: 'user-linked',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    expect(await findLinkedSteamUser(db, '76561198000000041')).toEqual({ userId: 'user-linked' })
  })

  it('ignores non-steam provider accounts for the same accountId', async () => {
    const db = await mockDB(schema)
    await createUserRow(db, 'user-other')
    await db.insert(account).values({
      id: 'acc-2',
      accountId: '76561198000000042',
      providerId: 'credential',
      userId: 'user-other',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    expect(await findLinkedSteamUser(db, '76561198000000042')).toBeNull()
  })
})
