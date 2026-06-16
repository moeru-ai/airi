import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'

import { mockDB } from '../../../libs/mock-db'
import { account, user } from '../../../schemas/accounts'
import { resolveOrCreateSteamUser, steamPlaceholderEmail } from './resolve-steam-user'

import * as schema from '../../../schemas'

describe('steamPlaceholderEmail', () => {
  it('builds a unique local email from steamid64', () => {
    expect(steamPlaceholderEmail('76561198000000001')).toBe('76561198000000001@steam.local')
  })
})

describe('resolveOrCreateSteamUser', () => {
  it('creates user and steam account for new steamid', async () => {
    const db = await mockDB(schema)
    const result = await resolveOrCreateSteamUser(db, '76561198000000001')

    expect(result.userId).toBeTruthy()
    expect(result.created).toBe(true)

    const accounts = await db
      .select()
      .from(account)
      .where(eq(account.providerId, 'steam'))

    expect(accounts).toHaveLength(1)
    expect(accounts[0]?.accountId).toBe('76561198000000001')
    expect(accounts[0]?.userId).toBe(result.userId)

    const users = await db.select().from(user).where(eq(user.id, result.userId))
    expect(users[0]?.email).toBe('76561198000000001@steam.local')
    expect(users[0]?.emailVerified).toBe(true)
  })

  it('returns existing user when steam account exists', async () => {
    const db = await mockDB(schema)
    const first = await resolveOrCreateSteamUser(db, '76561198000000002')
    const second = await resolveOrCreateSteamUser(db, '76561198000000002')

    expect(second.userId).toBe(first.userId)
    expect(second.created).toBe(false)

    const accounts = await db
      .select()
      .from(account)
      .where(eq(account.providerId, 'steam'))

    expect(accounts).toHaveLength(1)
  })

  it('writes Steam profile on new user when getPlayerSummaries succeeds', async () => {
    const db = await mockDB(schema)
    const getPlayerSummaries = vi.fn(async () => ({
      name: 'Alice',
      image: 'https://example.com/avatar.jpg',
    }))

    const result = await resolveOrCreateSteamUser(db, '76561198000000003', {
      publisherKey: 'test-key',
      getPlayerSummaries,
    })

    expect(result.created).toBe(true)
    expect(getPlayerSummaries).toHaveBeenCalledOnce()

    const users = await db.select().from(user).where(eq(user.id, result.userId))
    expect(users[0]?.name).toBe('Alice')
    expect(users[0]?.image).toBe('https://example.com/avatar.jpg')
  })

  it('falls back to placeholder when getPlayerSummaries returns null', async () => {
    const db = await mockDB(schema)
    const getPlayerSummaries = vi.fn(async () => null)

    const result = await resolveOrCreateSteamUser(db, '76561198000000004', {
      publisherKey: 'test-key',
      getPlayerSummaries,
    })

    expect(result.created).toBe(true)
    const users = await db.select().from(user).where(eq(user.id, result.userId))
    expect(users[0]?.name).toBe('Steam User')
    expect(users[0]?.image).toBeNull()
  })

  it('does not call getPlayerSummaries for existing steam account', async () => {
    const db = await mockDB(schema)
    const getPlayerSummaries = vi.fn(async () => ({
      name: 'Should Not Apply',
      image: 'https://example.com/nope.jpg',
    }))

    await resolveOrCreateSteamUser(db, '76561198000000005', {
      publisherKey: 'test-key',
      getPlayerSummaries,
    })
    const second = await resolveOrCreateSteamUser(db, '76561198000000005', {
      publisherKey: 'test-key',
      getPlayerSummaries,
    })

    expect(second.created).toBe(false)
    expect(getPlayerSummaries).toHaveBeenCalledOnce()
  })
})
