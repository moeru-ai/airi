import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { mockDB } from '../../../libs/mock-db'
import { verification } from '../../../schemas/accounts'
import { consumeEnrollmentToken, createEnrollmentToken } from './enrollment-token'

import * as schema from '../../../schemas'

describe('createEnrollmentToken', () => {
  it('stores a token bound to steamId + profile and returns its id', async () => {
    const db = await mockDB(schema)
    const token = await createEnrollmentToken(db, {
      steamId: '76561198000000020',
      profile: { name: 'Alice', image: 'https://example.com/a.jpg' },
    })

    expect(token).toBeTruthy()
    const rows = await db.select().from(verification).where(eq(verification.id, token))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.identifier).toBe('steam-enroll:76561198000000020')
    expect(rows[0]?.value).toContain('Alice')
    expect(rows[0]?.expiresAt.getTime()).toBeGreaterThan(Date.now())
  })

  it('accepts a null profile', async () => {
    const db = await mockDB(schema)
    const token = await createEnrollmentToken(db, { steamId: '76561198000000021', profile: null })
    expect(token).toBeTruthy()
  })
})

describe('consumeEnrollmentToken', () => {
  it('returns the steamId + profile on first consume and deletes the row', async () => {
    const db = await mockDB(schema)
    const token = await createEnrollmentToken(db, {
      steamId: '76561198000000022',
      profile: { name: 'Bob', image: '' },
    })

    const payload = await consumeEnrollmentToken(db, token)
    expect(payload).toEqual({ steamId: '76561198000000022', profile: { name: 'Bob', image: '' } })

    const rows = await db.select().from(verification).where(eq(verification.id, token))
    expect(rows).toHaveLength(0)
  })

  it('returns null on a second consume (single-use)', async () => {
    const db = await mockDB(schema)
    const token = await createEnrollmentToken(db, { steamId: '76561198000000023', profile: null })
    await consumeEnrollmentToken(db, token)
    expect(await consumeEnrollmentToken(db, token)).toBeNull()
  })

  it('returns null for an unknown token', async () => {
    const db = await mockDB(schema)
    expect(await consumeEnrollmentToken(db, 'does-not-exist')).toBeNull()
  })

  it('returns null for an expired token (and deletes it)', async () => {
    const db = await mockDB(schema)
    const token = await createEnrollmentToken(db, { steamId: '76561198000000024', profile: null })
    // Force expiry by backdating the row.
    await db.update(verification).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(verification.id, token))
    expect(await consumeEnrollmentToken(db, token)).toBeNull()
    const rows = await db.select().from(verification).where(eq(verification.id, token))
    expect(rows).toHaveLength(0)
  })
})
