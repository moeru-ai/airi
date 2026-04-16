import type { Database } from '../../libs/db'
import type { R2StorageService } from '../../services/r2'
import type { HonoEnv } from '../../types/hono'

import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { ApiError } from '../../utils/error'
import { createUserRoutes } from '../user'

import * as schema from '../../schemas'

function createMockR2Service(): R2StorageService {
  return {
    upload: vi.fn().mockResolvedValue('https://r2.example.com/avatars/user-1/123.png'),
    deleteObject: vi.fn().mockResolvedValue(undefined),
    getPublicUrl: vi.fn((key: string) => `https://r2.example.com/${key}`),
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
  let r2: R2StorageService
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
    r2 = createMockR2Service()

    const routes = createUserRoutes({ r2StorageService: r2, db })
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
      expect(body.url).toBe('https://r2.example.com/avatars/user-1/123.png')
      expect(r2.upload).toHaveBeenCalledOnce()

      const uploadCall = vi.mocked(r2.upload).mock.calls[0]
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

      const uploadCall = vi.mocked(r2.upload).mock.calls[0]
      expect(uploadCall[0]).toMatch(/\.jpg$/)
    })
  })

  describe('dELETE /avatar', () => {
    it('should return 401 without auth', async () => {
      const res = await app.request('/avatar', { method: 'DELETE' })
      expect(res.status).toBe(401)
    })

    it('should reset avatar to identicon and return new url', async () => {
      vi.mocked(r2.upload).mockResolvedValue('https://r2.example.com/avatars/user-1/identicon.png')

      const res = await app.fetch(
        new Request('http://localhost/avatar', { method: 'DELETE' }),
        { user: testUser } as Record<string, unknown>,
      )
      expect(res.status).toBe(200)
      const body = await res.json() as { url: string }
      expect(body.url).toBe('https://r2.example.com/avatars/user-1/identicon.png')

      const uploadCall = vi.mocked(r2.upload).mock.calls[0]
      expect(uploadCall[0]).toBe('avatars/user-1/identicon.png')
      expect(uploadCall[2]).toBe('image/png')
    })
  })

  describe('pOST /delete', () => {
    it('should return 401 without auth', async () => {
      const res = await app.request('/delete', { method: 'POST' })
      expect(res.status).toBe(401)
    })

    it('should soft-delete account and revoke sessions', async () => {
      await db.insert(schema.session).values({
        id: 'session-1',
        token: 'token-abc',
        userId: testUser.id,
        expiresAt: new Date(Date.now() + 86400000),
        updatedAt: new Date(),
      }).returning()

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
    })
  })
})
