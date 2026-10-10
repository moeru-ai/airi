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
import { createSocialAuthorizationRevoker } from '../social-authorization'
import { createTestDatabase } from './mock-db'

describe('confirmed account deletion', () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>
  let auth: Pick<ReturnType<typeof betterAuth>, 'handler'>
  const secret = 'test-secret-test-secret-test-secret'
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  let revoker: ReturnType<typeof createSocialAuthorizationRevoker>
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
    const authDb = db as unknown as AuthDatabase
    const env = parseAuthEnv({
      DATABASE_URL: 'postgres://localhost/test',
      REDIS_URL: 'redis://localhost:6379',
      PUBLIC_URL: 'http://localhost:3000',
      BETTER_AUTH_SECRET: secret,
      AUTH_GOOGLE_CLIENT_ID: 'google-client',
      AUTH_GOOGLE_CLIENT_SECRET: 'google-secret',
      AUTH_GITHUB_CLIENT_ID: 'github-client',
      AUTH_GITHUB_CLIENT_SECRET: 'github-secret',
    })
    revoker = createSocialAuthorizationRevoker(authDb, env, vi.fn<typeof fetch>())
    const configured = createAuth(authDb, env, {
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
    revokeForUser.mockImplementation(revoker.revokeForUser)
    await db.delete(schema.user)
    await seedAccount()
  })

  afterAll(async () => {
    await db.$client.close()
  })

  /** Seeds an account with a fresh persisted session, without contacting a social provider. */
  async function seedAccount(id = 'owner', email = 'person@example.com') {
    await db.insert(schema.user).values({ id, name: id, email, emailVerified: true })
    await db.insert(schema.account).values({ id, userId: id, providerId: 'steam', accountId: id })
    await db.insert(schema.session).values({
      id: `session-${id}`,
      token: `token-${id}`,
      userId: id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    })
  }

  /** Exercises the real router with bearer credentials or a browser cookie when an origin is supplied. */
  async function requestDeletion({ body = { confirm: true }, token = 'token-owner', path = '/delete-account', origin }: {
    body?: unknown
    token?: string
    path?: string
    origin?: string
  } = {}) {
    const headers = new Headers({ 'Content-Type': 'application/json' })
    if (origin) {
      const signature = createHmac('sha256', secret).update(token).digest('base64')
      headers.set('Cookie', `better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`)
      headers.set('Origin', origin)
    }
    else if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }
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

  it.each(['steam-id@steam.placeholder.local', 'apple-id@apple.placeholder.local', 'person@example.com'])(
    'deletes %s without sending email and leaves other accounts intact',
    async (email) => {
      await db.update(schema.user).set({ email }).where(eq(schema.user.id, 'owner'))
      await seedAccount('other', 'other@example.com')
      await db.insert(schema.session).values({
        id: 'second-session',
        token: 'second-token',
        userId: 'owner',
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
    expect((await requestDeletion({ body })).status).toBe(400)
    expect(revokeForUser).not.toHaveBeenCalled()
    expect(await db.select().from(schema.user)).toHaveLength(1)
  })

  it.each(['', 'invalid-token'])('rejects missing or invalid authentication (%s)', async (token) => {
    expect((await requestDeletion({ token })).status).toBe(401)
    expect(revokeForUser).not.toHaveBeenCalled()
  })

  it.each(['session', 'JWT'])('rejects stale sessions even with a fresh %s credential', async (credential) => {
    await db.update(schema.session).set({ createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) })
    const token = credential === 'JWT' ? await accessToken('session-owner') : 'token-owner'
    const response = await requestDeletion({ token })
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ code: 'SESSION_NOT_FRESH' })
    expect(revokeForUser).not.toHaveBeenCalled()
  })

  it.each([
    ['https://untrusted.example', 403],
    ['http://localhost:3000', 200],
  ])('checks browser origin %s (status %s)', async (origin, status) => {
    expect((await requestDeletion({ origin })).status).toBe(status)
    expect(revokeForUser).toHaveBeenCalledTimes(status === 200 ? 1 : 0)
  })

  it('accepts a native JWT with its active original session', async () => {
    expect((await requestDeletion({ token: await accessToken('session-owner') })).status).toBe(200)
  })

  it.each([undefined, 'missing-session', 'session-other'])('rejects a native JWT without its own active session (%s)', async (sid) => {
    await seedAccount('other', 'other@example.com')
    expect((await requestDeletion({ token: await accessToken(sid) })).status).toBe(401)
    expect(revokeForUser).not.toHaveBeenCalled()
  })

  it.each(['revocation', 'resource cleanup'])('preserves the account after %s failure and permits retry', async (step) => {
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
    const response = await requestDeletion({ body: {}, path: '/delete-user' })
    expect(response.status).toBe(200)
    expect(sendDeleteAccountVerification).toHaveBeenCalledOnce()
    expect(revokeForUser).not.toHaveBeenCalled()
    expect(await db.select().from(schema.user)).toHaveLength(1)
  })
})
