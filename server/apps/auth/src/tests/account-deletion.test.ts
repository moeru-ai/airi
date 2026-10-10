import type { AuthDatabase } from '../db'
import type { EmailService } from '../email'

import { createHmac, generateKeyPairSync } from 'node:crypto'

import { betterAuth } from 'better-auth'
import { eq } from 'drizzle-orm'
import { SignJWT } from 'jose'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import * as schema from '@proj-airi/auth-shared'

import { createAuth } from '../auth'
import { parseAuthEnv } from '../env'
import { createTestDatabase } from './mock-db'

describe('confirmed account deletion', () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>
  let auth: Pick<ReturnType<typeof betterAuth>, 'handler'>
  const secret = 'test-secret-test-secret-test-secret'
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const revokeForUser = vi.fn(async (_userId: string) => {})
  const softDeleteUserData = vi.fn(async (_input: { userId: string, reason: string }) => {})
  const sendDeleteAccountVerification = vi.fn<EmailService['sendDeleteAccountVerification']>(async () => {})

  beforeAll(async () => {
    db = await createTestDatabase()
    await db.insert(schema.jwks).values({
      id: 'deletion-test-key',
      publicKey: JSON.stringify(publicKey.export({ format: 'jwk' })),
      privateKey: 'unused-by-verifier',
      createdAt: new Date(),
    })
    // PGlite and node-postgres use the same Drizzle adapter contract in these handler tests.
    const configured = createAuth(db as unknown as AuthDatabase, parseAuthEnv({
      DATABASE_URL: 'postgres://localhost/test',
      REDIS_URL: 'redis://localhost:6379',
      PUBLIC_URL: 'http://localhost:3000',
      BETTER_AUTH_SECRET: secret,
      AUTH_GOOGLE_CLIENT_ID: 'google-client',
      AUTH_GOOGLE_CLIENT_SECRET: 'google-secret',
      AUTH_GITHUB_CLIENT_ID: 'github-client',
      AUTH_GITHUB_CLIENT_SECRET: 'github-secret',
    }), {
      send: vi.fn(),
      sendVerification: vi.fn(),
      sendPasswordReset: vi.fn(),
      sendMagicLink: vi.fn(),
      sendChangeEmailConfirmation: vi.fn(),
      sendDeleteAccountVerification,
    }, undefined, { softDeleteUserData, trackAuthEvent: vi.fn() }, { revokeForUser })
    // Better Auth skips origin checks in test mode unless explicitly enabled.
    auth = betterAuth({
      ...configured.options,
      advanced: { ...configured.options.advanced, disableOriginCheck: false },
    })
  })

  beforeEach(async () => {
    vi.resetAllMocks()
    await db.delete(schema.user)
  })

  afterAll(async () => {
    await db.$client.close()
  })

  /** Creates real persisted identity and sessions without contacting a social provider. */
  async function seedAccount(email = 'steam-id@steam.placeholder.local', ageHours = 0, id = 'owner') {
    const createdAt = new Date(Date.now() - ageHours * 60 * 60 * 1000)
    await db.insert(schema.user).values({ id, name: id, email, emailVerified: true, createdAt, updatedAt: createdAt })
    await db.insert(schema.account).values({
      id: `account-${id}`,
      userId: id,
      providerId: 'steam',
      accountId: id,
      createdAt,
      updatedAt: createdAt,
    })
    await db.insert(schema.session).values({
      id: `session-${id}`,
      token: `token-${id}`,
      userId: id,
      createdAt,
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    })
    return `token-${id}`
  }

  /** Sends a native bearer request through the real Auth router. */
  async function requestDeletion(body: unknown = { confirm: true }, token = 'token-owner', path = '/delete-account') {
    const headers = new Headers({ 'Content-Type': 'application/json' })
    if (token)
      headers.set('Authorization', `Bearer ${token}`)
    return auth.handler(new Request(`http://localhost:3000/api/auth${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }))
  }

  /** Signs native access tokens while leaving session authority in the database. */
  async function accessToken(sid?: string) {
    return new SignJWT(sid ? { sid } : {})
      .setProtectedHeader({ alg: 'RS256', kid: 'deletion-test-key' })
      .setSubject('owner')
      .setIssuer('http://localhost:3000/api/auth')
      .setAudience('http://localhost:3000')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey)
  }

  /** Sends browser requests with a signed session cookie to exercise origin protection. */
  async function cookieDeletion(origin: string) {
    const token = 'token-owner'
    const signature = createHmac('sha256', secret).update(token).digest('base64')
    return auth.handler(new Request('http://localhost:3000/api/auth/delete-account', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': origin,
        'Cookie': `better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`,
      },
      body: JSON.stringify({ confirm: true }),
    }))
  }

  // ROOT CAUSE: Placeholder email accounts cannot receive deletion links.
  // Explicit confirmation now selects a separate endpoint with session checks and the same cleanup hooks.
  it.each(['steam-id@steam.placeholder.local', 'apple-id@apple.placeholder.local', 'person@example.com'])(
    'deletes %s without sending email and leaves other accounts intact',
    async (email) => {
      await seedAccount(email)
      await seedAccount('other@example.com', 0, 'other')
      await db.insert(schema.session).values({
        id: 'second-session',
        token: 'second-token',
        userId: 'owner',
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      })

      const response = await requestDeletion()

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ success: true, message: 'User deleted' })
      expect(sendDeleteAccountVerification).not.toHaveBeenCalled()
      expect(revokeForUser).toHaveBeenCalledWith('owner')
      expect(softDeleteUserData).toHaveBeenCalledWith({ userId: 'owner', reason: 'user-requested' })
      expect(revokeForUser.mock.invocationCallOrder[0]).toBeLessThan(softDeleteUserData.mock.invocationCallOrder[0])
      expect(await db.select().from(schema.user).where(eq(schema.user.id, 'owner'))).toHaveLength(0)
      expect(await db.select().from(schema.session).where(eq(schema.session.userId, 'owner'))).toHaveLength(0)
      expect(await db.select().from(schema.account).where(eq(schema.account.userId, 'owner'))).toHaveLength(0)
      expect(await db.select().from(schema.user).where(eq(schema.user.id, 'other'))).toHaveLength(1)
      expect(response.headers.get('set-cookie')).toContain('Max-Age=0')
      expect((await requestDeletion()).status).toBe(401)
    },
  )

  it.each([{}, { confirm: false }, { confirm: 'true' }, { confirm: true, userId: 'other' }])('rejects invalid confirmation %j', async (body) => {
    await seedAccount()
    expect((await requestDeletion(body)).status).toBe(400)
    expect(revokeForUser).not.toHaveBeenCalled()
    expect(await db.select().from(schema.user)).toHaveLength(1)
  })

  it.each(['', 'invalid-token'])('rejects missing or invalid authentication (%s)', async (token) => {
    await seedAccount()
    expect((await requestDeletion({ confirm: true }, token)).status).toBe(401)
    expect(revokeForUser).not.toHaveBeenCalled()
  })

  it('rejects an old session even after its updatedAt timestamp changes', async () => {
    await seedAccount(undefined, 25)
    const response = await requestDeletion()
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ code: 'SESSION_NOT_FRESH' })
    expect(revokeForUser).not.toHaveBeenCalled()
  })

  it('rejects an untrusted browser origin before cleanup', async () => {
    await seedAccount()
    expect((await cookieDeletion('https://untrusted.example')).status).toBe(403)
    expect(revokeForUser).not.toHaveBeenCalled()
  })

  it('accepts an authenticated browser confirmation from the trusted origin', async () => {
    await seedAccount()
    expect((await cookieDeletion('http://localhost:3000')).status).toBe(200)
  })

  it('accepts a native JWT with its active original session', async () => {
    await seedAccount()
    expect((await requestDeletion({ confirm: true }, await accessToken('session-owner'))).status).toBe(200)
  })

  it.each([undefined, 'missing-session', 'session-other'])('rejects a native JWT without its own active session (%s)', async (sid) => {
    await seedAccount()
    await seedAccount('other@example.com', 0, 'other')
    expect((await requestDeletion({ confirm: true }, await accessToken(sid))).status).toBe(401)
    expect(revokeForUser).not.toHaveBeenCalled()
  })

  it('rejects a newly issued JWT when its original session is stale', async () => {
    await seedAccount(undefined, 25)
    const response = await requestDeletion({ confirm: true }, await accessToken('session-owner'))
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ code: 'SESSION_NOT_FRESH' })
    expect(revokeForUser).not.toHaveBeenCalled()
  })

  it.each(['revocation', 'resource cleanup'])('preserves the account after %s failure and permits retry', async (step) => {
    await seedAccount()
    if (step === 'revocation')
      revokeForUser.mockRejectedValueOnce(new Error('provider unavailable'))
    else
      softDeleteUserData.mockRejectedValueOnce(new Error('resource API unavailable'))

    expect((await requestDeletion()).status).toBe(500)
    expect(await db.select().from(schema.user)).toHaveLength(1)
    expect(await db.select().from(schema.session)).toHaveLength(1)
    if (step === 'revocation')
      expect(softDeleteUserData).not.toHaveBeenCalled()
    expect((await requestDeletion()).status).toBe(200)
  })

  it('keeps the send-email endpoint from deleting an account immediately', async () => {
    await seedAccount('person@example.com')
    const response = await requestDeletion({}, 'token-owner', '/delete-user')
    expect(response.status).toBe(200)
    expect(sendDeleteAccountVerification).toHaveBeenCalledOnce()
    expect(revokeForUser).not.toHaveBeenCalled()
    expect(await db.select().from(schema.user)).toHaveLength(1)
  })
})
