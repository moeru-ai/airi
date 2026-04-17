import type { Database } from '../../libs/db'
import type { S3StorageService } from '../../services/s3'
import type { HonoEnv } from '../../types/hono'

import { createHash } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { ApiError } from '../../utils/error'
import { createUserRoutes } from '../user'

import * as schema from '../../schemas'

function createMockS3Service(): S3StorageService {
  return {
    upload: vi.fn().mockResolvedValue('https://s3.example.com/avatars/user-1/123.png'),
    deleteObject: vi.fn().mockResolvedValue(undefined),
    getPublicUrl: vi.fn((key: string) => `https://s3.example.com/${key}`),
    isAvailable: vi.fn().mockReturnValue(true),
  }
}

function createTestFile(
  name: string,
  type: string,
  sizeBytes: number,
): File {
  const bytes = new Uint8Array(sizeBytes)
  return new File([bytes], name, { type })
}

describe('userRoutes', () => {
  let db: Database
  let s3: S3StorageService
  let app: Hono<HonoEnv>
  let testUser: typeof schema.user.$inferSelect

  beforeAll(async () => {
    db = await mockDB(schema)

    const [inserted] = await db.insert(schema.user).values({
      id: 'user-1',
      name: 'Test User',
      email: 'test@example.com',
    }).returning()
    testUser = inserted
  })

  beforeEach(() => {
    s3 = createMockS3Service()

    const routes = createUserRoutes({ s3StorageService: s3, db })
    app = new Hono<HonoEnv>()

    app.onError((err, c) => {
      if (err instanceof ApiError) {
        return c.json({
          error: err.errorCode,
          message: err.message,
          details: err.details,
        }, err.statusCode)
      }
      return c.json({ error: 'Internal Server Error', message: err.message }, 500)
    })

    app.use('*', async (c, next) => {
      const envUser = (c.env as Record<string, unknown>)?.user
      if (envUser) {
        c.set('user', envUser as typeof testUser)
      }
      await next()
    })

    app.route('/', routes)
  })

  describe('pOST /avatar', () => {
    it('should return 401 without auth', async () => {
      const res = await app.request('/avatar', { method: 'POST' })
      expect(res.status).toBe(401)
    })

    it('should return 400 when no file provided', async () => {
      const formData = new FormData()
      const res = await app.fetch(
        new Request('http://localhost/avatar', { method: 'POST', body: formData }),
        { user: testUser } as Record<string, unknown>,
      )
      expect(res.status).toBe(400)
      const body = await res.json() as { error: string }
      expect(body.error).toBe('MISSING_FILE')
    })

    it('should return 400 for invalid MIME type', async () => {
      const formData = new FormData()
      formData.append('file', createTestFile('test.txt', 'text/plain', 1024))

      const res = await app.fetch(
        new Request('http://localhost/avatar', { method: 'POST', body: formData }),
        { user: testUser } as Record<string, unknown>,
      )
      expect(res.status).toBe(400)
      const body = await res.json() as { error: string }
      expect(body.error).toBe('INVALID_FILE_TYPE')
    })

    it('should return 400 for oversized file', async () => {
      const formData = new FormData()
      formData.append('file', createTestFile('big.png', 'image/png', 6 * 1024 * 1024))

      const res = await app.fetch(
        new Request('http://localhost/avatar', { method: 'POST', body: formData }),
        { user: testUser } as Record<string, unknown>,
      )
      expect(res.status).toBe(400)
      const body = await res.json() as { error: string }
      expect(body.error).toBe('FILE_TOO_LARGE')
    })

    it('should upload valid image and return url', async () => {
      const formData = new FormData()
      formData.append('file', createTestFile('avatar.png', 'image/png', 1024))

      const res = await app.fetch(
        new Request('http://localhost/avatar', { method: 'POST', body: formData }),
        { user: testUser } as Record<string, unknown>,
      )
      expect(res.status).toBe(200)
      const body = await res.json() as { url: string }
      expect(body.url).toBe('https://s3.example.com/avatars/user-1/123.png')
      expect(s3.upload).toHaveBeenCalledOnce()

      const uploadCall = vi.mocked(s3.upload).mock.calls[0]
      expect(uploadCall[0]).toMatch(/^avatars\/user-1\/\d+\.png$/)
      expect(uploadCall[2]).toBe('image/png')
    })

    it('should map jpeg MIME type to jpg extension', async () => {
      const formData = new FormData()
      formData.append('file', createTestFile('photo.jpg', 'image/jpeg', 512))

      const res = await app.fetch(
        new Request('http://localhost/avatar', { method: 'POST', body: formData }),
        { user: testUser } as Record<string, unknown>,
      )
      expect(res.status).toBe(200)

      const uploadCall = vi.mocked(s3.upload).mock.calls[0]
      expect(uploadCall[0]).toMatch(/\.jpg$/)
    })
  })

  describe('dELETE /avatar', () => {
    it('should return 401 without auth', async () => {
      const res = await app.request('/avatar', { method: 'DELETE' })
      expect(res.status).toBe(401)
    })

    it('should reset avatar to a Gravatar URL keyed off the user email and skip S3 upload', async () => {
      const res = await app.fetch(
        new Request('http://localhost/avatar', { method: 'DELETE' }),
        { user: testUser } as Record<string, unknown>,
      )
      expect(res.status).toBe(200)
      const body = await res.json() as { url: string }

      const expectedHash = createHash('sha256').update(testUser.email.trim().toLowerCase()).digest('hex')
      const expectedUrl = `https://www.gravatar.com/avatar/${expectedHash}?s=256&d=identicon`
      expect(body.url).toBe(expectedUrl)

      // Gravatar replaces the identicon flow — DELETE /avatar must not push
      // an identicon PNG to S3 anymore.
      expect(s3.upload).not.toHaveBeenCalled()
    })
  })

  describe('pOST /delete', () => {
    it('should return 401 without auth', async () => {
      const res = await app.request('/delete', { method: 'POST' })
      expect(res.status).toBe(401)
    })

    it('should soft-delete account and revoke sessions and oauth issued tokens atomically', async () => {
      // Insert a session plus a full OAuth token chain to prove the
      // transactional cleanup wipes every issued token tied to this user.
      // Otherwise external apps could still mint access tokens on behalf of
      // the soft-deleted user via /oauth/token.
      await db.insert(schema.session).values({
        id: 'session-1',
        token: 'token-abc',
        userId: testUser.id,
        expiresAt: new Date(Date.now() + 86400000),
        updatedAt: new Date(),
      }).returning()

      await db.insert(schema.oauthClient).values({
        id: 'oauth-client-1',
        clientId: 'oauth-client-1',
        redirectUris: ['http://localhost/cb'],
      })

      await db.insert(schema.oauthRefreshToken).values({
        id: 'refresh-1',
        token: 'rt-abc',
        clientId: 'oauth-client-1',
        userId: testUser.id,
        scopes: ['openid'],
      })

      await db.insert(schema.oauthAccessToken).values({
        id: 'access-1',
        token: 'at-abc',
        clientId: 'oauth-client-1',
        userId: testUser.id,
        refreshId: 'refresh-1',
        scopes: ['openid'],
      })

      const res = await app.fetch(
        new Request('http://localhost/delete', { method: 'POST' }),
        { user: testUser } as Record<string, unknown>,
      )
      expect(res.status).toBe(200)
      const body = await res.json() as { success: boolean }
      expect(body.success).toBe(true)

      const [updatedUser] = await db
        .select()
        .from(schema.user)
        .where(eq(schema.user.id, testUser.id))
      expect(updatedUser.deletedAt).toBeTruthy()

      const remainingSessions = await db
        .select()
        .from(schema.session)
        .where(eq(schema.session.userId, testUser.id))
      expect(remainingSessions).toHaveLength(0)

      const remainingAccess = await db
        .select()
        .from(schema.oauthAccessToken)
        .where(eq(schema.oauthAccessToken.userId, testUser.id))
      expect(remainingAccess).toHaveLength(0)

      const remainingRefresh = await db
        .select()
        .from(schema.oauthRefreshToken)
        .where(eq(schema.oauthRefreshToken.userId, testUser.id))
      expect(remainingRefresh).toHaveLength(0)
    })
  })
})
