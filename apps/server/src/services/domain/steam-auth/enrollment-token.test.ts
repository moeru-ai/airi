import type { Database } from '../../../libs/db'

import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { mockDB } from '../../../libs/mock-db'
import { verification } from '../../../schemas/accounts'
import { consumeEnrollmentToken, createEnrollmentToken } from './enrollment-token'

import * as schema from '../../../schemas'

describe('enrollment token', () => {
  let db: Database

  // NOTICE: mockDB pushSchema is slow on cold CI runners; share one DB per file.
  beforeAll(async () => {
    db = await mockDB(schema)
  }, 30_000)

  beforeEach(async () => {
    await db.delete(verification)
  })

  describe('createEnrollmentToken', () => {
    it('stores a token bound to steamId + profile and returns its id', async () => {
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
      const token = await createEnrollmentToken(db, { steamId: '76561198000000021', profile: null })
      expect(token).toBeTruthy()
    })

    // ROOT CAUSE:
    //
    // Railway production has UNIQUE(verification.value). createEnrollmentToken
    // used to store only `{"profile":{...}}`, so a second Sign-in for the same
    // Steam profile failed with SQLSTATE 23505 / constraint verification_value
    // (500 INTERNAL_SERVER_ERROR) after the first STEAM_NEEDS_ENROLLMENT 403.
    //
    // We fixed this by embedding a per-token `jti` in `value` and replacing any
    // prior steam-enroll row for the same identifier before insert.
    it('allows re-issuing a token for the same steamId and profile', async () => {
      const profile = { name: 'AnLulu', image: 'https://avatars.steamstatic.com/example.jpg' }
      const first = await createEnrollmentToken(db, { steamId: '76561198152466558', profile })
      const second = await createEnrollmentToken(db, { steamId: '76561198152466558', profile })

      expect(second).not.toBe(first)
      const rows = await db.select().from(verification).where(eq(verification.identifier, 'steam-enroll:76561198152466558'))
      expect(rows).toHaveLength(1)
      expect(rows[0]?.id).toBe(second)
      expect(rows[0]?.value).toContain(second)
    })
  })

  describe('consumeEnrollmentToken', () => {
    it('returns the steamId + profile on first consume and deletes the row', async () => {
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
      const token = await createEnrollmentToken(db, { steamId: '76561198000000023', profile: null })
      await consumeEnrollmentToken(db, token)
      expect(await consumeEnrollmentToken(db, token)).toBeNull()
    })

    it('returns null for an unknown token', async () => {
      expect(await consumeEnrollmentToken(db, 'does-not-exist')).toBeNull()
    })

    it('returns null for an expired token (and deletes it)', async () => {
      const token = await createEnrollmentToken(db, { steamId: '76561198000000024', profile: null })
      // Force expiry by backdating the row.
      await db.update(verification).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(verification.id, token))
      expect(await consumeEnrollmentToken(db, token)).toBeNull()
      const rows = await db.select().from(verification).where(eq(verification.id, token))
      expect(rows).toHaveLength(0)
    })
  })
})
