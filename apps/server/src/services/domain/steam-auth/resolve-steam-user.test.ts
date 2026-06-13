import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { mockDB } from '../../../libs/mock-db'
import { account, user } from '../../../schemas/accounts'
import { resolveOrCreateSteamUser, steamPlaceholderEmail } from './resolve-steam-user'

import * as schema from '../../../schemas'

describe('steamPlaceholderEmail', () => {
  it('builds a unique local email from steamid64', () => {
    expect(steamPlaceholderEmail('76561198000000001')).toBe('steam+76561198000000001@steam.local')
  })
})

describe('resolveOrCreateSteamUser', () => {
  it('creates user and steam account for new steamid', async () => {
    const db = await mockDB(schema)
    const result = await resolveOrCreateSteamUser(db, '76561198000000001')

    expect(result.userId).toBeTruthy()

    const accounts = await db
      .select()
      .from(account)
      .where(eq(account.providerId, 'steam'))

    expect(accounts).toHaveLength(1)
    expect(accounts[0]?.accountId).toBe('76561198000000001')
    expect(accounts[0]?.userId).toBe(result.userId)

    const users = await db.select().from(user).where(eq(user.id, result.userId))
    expect(users[0]?.email).toBe('steam+76561198000000001@steam.local')
    expect(users[0]?.emailVerified).toBe(true)
  })

  it('returns existing user when steam account exists', async () => {
    const db = await mockDB(schema)
    const first = await resolveOrCreateSteamUser(db, '76561198000000002')
    const second = await resolveOrCreateSteamUser(db, '76561198000000002')

    expect(second.userId).toBe(first.userId)

    const accounts = await db
      .select()
      .from(account)
      .where(eq(account.providerId, 'steam'))

    expect(accounts).toHaveLength(1)
  })
})
