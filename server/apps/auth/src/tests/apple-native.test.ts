import type { AuthDatabase } from '../db'

import { generateKeyPairSync } from 'node:crypto'

import { betterAuth } from 'better-auth'
import { eq } from 'drizzle-orm'
import { decodeJwt, SignJWT } from 'jose'
import { object, parse, string } from 'valibot'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import * as schema from '@proj-airi/auth-shared'

import { createAuth } from '../auth'
import { parseAuthEnv } from '../env'
import { appleNative } from '../plugins/apple-native'
import { createSocialAuthorizationRevoker } from '../social-authorization'
import { createTestDatabase } from './mock-db'

describe('native Apple authorization', () => {
  const appleKey = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const sessionKey = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const secretKey = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const env = parseAuthEnv({
    DATABASE_URL: 'postgres://localhost/test',
    REDIS_URL: 'redis://localhost:6379',
    PUBLIC_URL: 'http://localhost:3000',
    BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret',
    AUTH_GOOGLE_CLIENT_ID: 'google',
    AUTH_GOOGLE_CLIENT_SECRET: 'google-secret',
    AUTH_GITHUB_CLIENT_ID: 'github',
    AUTH_GITHUB_CLIENT_SECRET: 'github-secret',
    AUTH_APPLE_CLIENT_ID: 'web-client',
    AUTH_APPLE_APP_BUNDLE_IDENTIFIERS: 'native-client',
    AUTH_APPLE_TEAM_ID: 'team',
    AUTH_APPLE_KEY_ID: 'key',
    AUTH_APPLE_PRIVATE_KEY_PEM: secretKey.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  })
  const fetchRequest = vi.fn<typeof fetch>()
  const cleanup = vi.fn(async () => {})
  let db: Awaited<ReturnType<typeof createTestDatabase>>
  let auth: Pick<ReturnType<typeof betterAuth>, 'handler'>
  let accountAdapter: Pick<Awaited<ReturnType<typeof betterAuth>['$context']>['internalAdapter'], 'updateAccount'>

  /** Signs Apple fixture tokens without bypassing signature, audience, or nonce verification. */
  async function identity(subject = 'apple-owner', audience = 'native-client', nonce = 'nonce') {
    return new SignJWT({ nonce, email: `${subject}@example.com`, email_verified: true })
      .setSubject(subject)
      .setAudience(audience)
      .setIssuer('https://appleid.apple.com')
      .setIssuedAt()
      .setExpirationTime('5m')
      .setProtectedHeader({ alg: 'RS256' })
      .sign(appleKey.privateKey)
  }

  /** Calls the real Auth router without contacting Apple or deleting production data. */
  async function request(path: string, body: unknown, token = '') {
    return auth.handler(new Request(`http://localhost:3000/api/auth${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    }))
  }

  /** Builds one native authorization request and the matching Apple token response. */
  async function credential(subject = 'apple-owner') {
    const identityToken = await identity(subject)
    fetchRequest.mockResolvedValue(Response.json({ access_token: 'access', refresh_token: 'refresh', id_token: identityToken }))
    return { identityToken, authorizationCode: 'one-time-code', nonce: 'nonce' }
  }

  beforeAll(async () => {
    db = await createTestDatabase()
    await db.insert(schema.jwks).values({
      id: 'native-test-key',
      publicKey: JSON.stringify(sessionKey.publicKey.export({ format: 'jwk' })),
      privateKey: 'unused',
      createdAt: new Date(),
    })
    const authDb = db as unknown as AuthDatabase
    const configured = createAuth(authDb, env, {
      send: vi.fn(),
      sendVerification: vi.fn(),
      sendPasswordReset: vi.fn(),
      sendMagicLink: vi.fn(),
      sendChangeEmailConfirmation: vi.fn(),
      sendDeleteAccountVerification: vi.fn(),
    }, undefined, { checkUserDeletion: vi.fn(), softDeleteUserData: cleanup, trackAuthEvent: vi.fn() }, createSocialAuthorizationRevoker(authDb, env, fetchRequest))
    const instance = betterAuth({
      ...configured.options,
      advanced: { ...configured.options.advanced, disableOriginCheck: false },
      socialProviders: { apple: {
        clientId: 'web-client',
        clientSecret: 'test-secret',
        // The plugin verifies the fixture signature. Avoid Better Auth fetching production Apple keys again.
        verifyIdToken: async () => true,
      } },
      plugins: configured.options.plugins!.filter(plugin => plugin.id !== 'apple-native')
        .concat(appleNative(env, fetchRequest, async () => appleKey.publicKey)),
    })
    auth = instance
    accountAdapter = (await instance.$context).internalAdapter
  })
  beforeEach(async () => {
    vi.resetAllMocks()
    await db.delete(schema.user)
    await db.insert(schema.user).values({ id: 'owner', name: 'owner', email: 'apple-owner@example.com', emailVerified: true })
    await db.insert(schema.account).values({ id: 'apple-account', userId: 'owner', providerId: 'apple', accountId: 'apple-owner' })
    await db.insert(schema.session).values({ id: 'old-session', token: 'old-token', userId: 'owner', createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000), expiresAt: new Date(Date.now() + 60 * 60 * 1000) })
  })
  afterAll(async () => {
    await db.$client.close()
  })

  it.each(['apple-owner', 'new-apple-user'])('saves revocable tokens during sign-in for %s', async (subject) => {
    const response = await request('/sign-in/apple-native', await credential(subject))
    expect(response.status).toBe(200)
    const result = parse(object({ token: string() }), await response.json())
    expect(result.token).toBeTruthy()
    const [account] = await db.select().from(schema.account).where(eq(schema.account.accountId, subject))
    expect(account).toMatchObject({ accessToken: 'access', refreshToken: 'refresh' })
    expect(decodeJwt(account.idToken!).aud).toBe('native-client')
    const body = new URLSearchParams(fetchRequest.mock.calls[0][1]?.body?.toString())
    expect(body.get('client_id')).toBe('native-client')
    expect(decodeJwt(body.get('client_secret')!).sub).toBe('native-client')
    expect(JSON.stringify(result)).not.toContain('refresh')
  })

  it('repairs an old account then completes explicit deletion with the native client ID', async () => {
    const response = await request('/account/apple-authorization', await credential(), 'old-token')
    expect(response.status).toBe(200)
    const { token } = parse(object({ token: string() }), await response.json())
    const [session] = await db.select().from(schema.session).where(eq(schema.session.token, token))
    expect(Date.now() - session.createdAt.getTime()).toBeLessThan(5000)
    expect(await db.select().from(schema.user)).toHaveLength(1)
    fetchRequest.mockResolvedValue(new Response(null, { status: 200 }))
    expect((await request('/delete-account', { confirm: true }, token)).status).toBe(200)
    const body = new URLSearchParams(fetchRequest.mock.calls.at(-1)![1]?.body?.toString())
    expect(body.get('client_id')).toBe('native-client')
    expect(body.get('token')).toBe('refresh')
    expect(cleanup).toHaveBeenCalledOnce()
    expect(await db.select().from(schema.user)).toHaveLength(0)
    expect(await db.select().from(schema.session)).toHaveLength(0)
  })

  it('returns an actionable missing-token error and leaves all data intact', async () => {
    await db.update(schema.session).set({ createdAt: new Date() })
    const response = await request('/delete-account', { confirm: true }, 'old-token')
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'APPLE_REAUTHENTICATION_REQUIRED' })
    expect(cleanup).not.toHaveBeenCalled()
    expect(fetchRequest).not.toHaveBeenCalled()
    expect(await db.select().from(schema.user)).toHaveLength(1)
  })

  it.each(['missing-session', 'foreign-apple', 'nonce', 'audience', 'exchanged-subject', 'exchanged-nonce', 'code-rejected', 'signature', 'missing-refresh'])(
    'rejects %s without changing the account or its old session',
    async (scenario) => {
      const body = await credential(scenario === 'foreign-apple' ? 'other-apple' : 'apple-owner')
      if (scenario === 'nonce')
        body.nonce = 'wrong'
      if (scenario === 'audience')
        body.identityToken = await identity('apple-owner', 'untrusted-client')
      if (scenario === 'exchanged-subject') {
        fetchRequest.mockResolvedValue(Response.json({
          access_token: 'access',
          refresh_token: 'refresh',
          id_token: await identity('other-apple'),
        }))
      }
      if (scenario === 'exchanged-nonce') {
        fetchRequest.mockResolvedValue(Response.json({
          access_token: 'access',
          refresh_token: 'refresh',
          id_token: await identity('apple-owner', 'native-client', 'different'),
        }))
      }
      if (scenario === 'signature')
        body.identityToken = `${body.identityToken.slice(0, -20)}invalid-signature`
      if (scenario === 'missing-refresh')
        fetchRequest.mockResolvedValue(Response.json({ access_token: 'access', id_token: body.identityToken }))
      if (scenario === 'code-rejected')
        fetchRequest.mockResolvedValue(Response.json({ error: 'invalid_grant' }, { status: 400 }))
      const response = await request('/account/apple-authorization', body, scenario === 'missing-session' ? '' : 'old-token')
      expect(response.status).toBeGreaterThanOrEqual(400)
      const [account] = await db.select().from(schema.account)
      expect(account.refreshToken).toBeNull()
      expect(await db.select().from(schema.user)).toHaveLength(1)
      expect(await db.select().from(schema.session)).toHaveLength(1)
      expect(cleanup).not.toHaveBeenCalled()
    },
  )

  it.each([true, false])('requires an authoritative original session for JWT repair (sid: %s)', async (hasSession) => {
    const token = await new SignJWT(hasSession ? { sid: 'old-session' } : {})
      .setSubject('owner')
      .setAudience('http://localhost:3000')
      .setIssuer('http://localhost:3000/api/auth')
      .setIssuedAt()
      .setExpirationTime('5m')
      .setProtectedHeader({ alg: 'RS256', kid: 'native-test-key' })
      .sign(sessionKey.privateKey)
    const response = await request('/account/apple-authorization', await credential(), token)
    expect(response.status).toBe(hasSession ? 200 : 401)
    if (!hasSession)
      expect(fetchRequest).not.toHaveBeenCalled()
  })

  it('retains saved tokens and the user when cleanup fails, then permits a confirmed retry', async () => {
    const response = await request('/account/apple-authorization', await credential(), 'old-token')
    const { token } = parse(object({ token: string() }), await response.json())
    fetchRequest.mockImplementation(async () => new Response(null, { status: 200 }))
    cleanup.mockRejectedValueOnce(new Error('Resource cleanup unavailable'))
    expect((await request('/delete-account', { confirm: true }, token)).status).toBe(500)
    const [account] = await db.select().from(schema.account)
    expect(account.refreshToken).toBe('refresh')
    expect(await db.select().from(schema.user)).toHaveLength(1)
    expect((await request('/delete-account', { confirm: true }, token)).status).toBe(200)
    expect(await db.select().from(schema.user)).toHaveLength(0)
  })

  it('does not expose a new session when token storage fails', async () => {
    const update = vi.spyOn(accountAdapter, 'updateAccount').mockRejectedValueOnce(new Error('Storage unavailable'))
    try {
      expect((await request('/sign-in/apple-native', await credential())).status).toBe(500)
      const sessions = await db.select().from(schema.session)
      expect(sessions.map(session => session.id)).toEqual(['old-session'])
    }
    finally {
      update.mockRestore()
    }
  })

  it('rejects a foreign browser origin', async () => {
    const response = await auth.handler(new Request('http://localhost:3000/api/auth/sign-in/apple-native', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': 'https://evil.example' },
      body: JSON.stringify(await credential()),
    }))
    expect(response.status).toBe(403)
    expect(fetchRequest).not.toHaveBeenCalled()
  })
})
