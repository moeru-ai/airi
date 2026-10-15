import type { AuthDatabase } from '../db'

import { createHash, generateKeyPairSync } from 'node:crypto'

import { betterAuth } from 'better-auth'
import { symmetricEncrypt } from 'better-auth/crypto'
import { eq } from 'drizzle-orm'
import { decodeJwt, errors, SignJWT } from 'jose'
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
  const sessionKey = generateKeyPairSync('ed25519')
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
  const nonceHash = createHash('sha256').update('nonce').digest('hex')
  const resolveKey = vi.fn(async () => appleKey.publicKey)
  const cleanup = vi.fn(async () => {})
  let db: Awaited<ReturnType<typeof createTestDatabase>>
  let auth: Pick<ReturnType<typeof betterAuth>, 'handler'>
  let accountAdapter: Pick<Awaited<ReturnType<typeof betterAuth>['$context']>['internalAdapter'], 'updateAccount'>

  /** Signs Apple fixture tokens without bypassing signature, audience, or nonce verification. */
  async function identity(subject = 'apple-owner', audience = 'native-client', nonce: string | null = nonceHash, email = true) {
    return new SignJWT({ ...(nonce === null ? {} : { nonce }), ...(email ? { email: `${subject}@example.com`, email_verified: true } : {}) })
      .setSubject(subject)
      .setAudience(audience)
      .setIssuer('https://appleid.apple.com')
      .setIssuedAt()
      .setExpirationTime('5m')
      .setProtectedHeader({ alg: 'RS256', kid: 'apple-test' })
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
      privateKey: JSON.stringify(await symmetricEncrypt({ key: env.BETTER_AUTH_SECRET, data: JSON.stringify(sessionKey.privateKey.export({ format: 'jwk' })) })),
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
      plugins: configured.options.plugins!.filter(plugin => plugin.id !== 'apple-native')
        .concat(appleNative(env, fetchRequest, resolveKey)),
    })
    auth = instance
    accountAdapter = (await instance.$context).internalAdapter
  })
  beforeEach(async () => {
    vi.resetAllMocks()
    resolveKey.mockResolvedValue(appleKey.publicKey)
    vi.stubGlobal('fetch', vi.fn(async (input) => {
      if (String(input) !== 'https://appleid.apple.com/auth/keys')
        throw new Error('Unexpected external request')
      return Response.json({ keys: [{ ...appleKey.publicKey.export({ format: 'jwk' }), kid: 'apple-test', alg: 'RS256' }] })
    }))
    await db.delete(schema.user)
    await db.insert(schema.user).values({ id: 'owner', name: 'owner', email: 'apple-owner@example.com', emailVerified: true })
    await db.insert(schema.account).values({ id: 'apple-account', userId: 'owner', providerId: 'apple', accountId: 'apple-owner' })
    await db.insert(schema.session).values({ id: 'old-session', token: 'old-token', userId: 'owner', createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000), expiresAt: new Date(Date.now() + 60 * 60 * 1000) })
  })
  afterAll(async () => {
    vi.unstubAllGlobals()
    await db.$client.close()
  })

  // First-authorization name regression: https://github.com/moeru-ai/airi/pull/2984#discussion_r4280730615
  it.each(['apple-owner', 'new-apple-user'])('saves revocable tokens during sign-in for %s', async (subject) => {
    const response = await request('/sign-in/apple-native', {
      ...await credential(subject),
      ...(subject === 'new-apple-user' ? { user: { name: { firstName: 'Airi', lastName: 'Test' } } } : {}),
    })
    expect(response.status).toBe(200)
    const result = parse(object({ token: string(), user: object({ id: string(), name: string() }) }), await response.json())
    expect(result.token).toBeTruthy()
    if (subject === 'new-apple-user') {
      expect(result.user.name).toBe('Airi Test')
      const [user] = await db.select().from(schema.user).where(eq(schema.user.id, result.user.id))
      expect(user.name).toBe('Airi Test')
    }
    const [account] = await db.select().from(schema.account).where(eq(schema.account.accountId, subject))
    expect(account).toMatchObject({ accessToken: 'access', refreshToken: 'refresh' })
    expect(decodeJwt(account.idToken!).aud).toBe('native-client')
    const body = new URLSearchParams(fetchRequest.mock.calls[0][1]?.body?.toString())
    expect(body.get('client_id')).toBe('native-client')
    expect(decodeJwt(body.get('client_secret')!).sub).toBe('native-client')
    expect(JSON.stringify(result)).not.toContain('refresh')
  })

  it('accepts exchanged tokens without nonce using the production provider and its missing-email mapping', async () => {
    const identityToken = await identity('no-email', 'native-client', nonceHash, false)
    fetchRequest.mockResolvedValue(Response.json({
      access_token: 'access',
      refresh_token: 'refresh',
      id_token: await identity('no-email', 'native-client', null, false),
    }))
    const response = await request('/sign-in/apple-native', { identityToken, authorizationCode: 'code', nonce: 'nonce' })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ user: { email: 'no-email@apple.placeholder.local' } })
  })

  it.each([
    ['invalid-grant', 400],
    ['apple-5xx', 502],
    ['network', 503],
    ['jwks-timeout', 503],
    ['missing-client-id', 503],
  ])('classifies %s and preserves the existing session', async (scenario, status) => {
    const body = await credential()
    if (scenario === 'invalid-grant')
      fetchRequest.mockResolvedValue(Response.json({ error: 'invalid_grant' }, { status: 400 }))
    if (scenario === 'apple-5xx')
      fetchRequest.mockResolvedValue(new Response(null, { status: 503 }))
    if (scenario === 'network')
      fetchRequest.mockRejectedValue(new DOMException('Timed out', 'TimeoutError'))
    if (scenario === 'jwks-timeout')
      resolveKey.mockRejectedValueOnce(new errors.JWKSTimeout())
    const originalClientId = env.AUTH_APPLE_CLIENT_ID
    if (scenario === 'missing-client-id')
      env.AUTH_APPLE_CLIENT_ID = ''
    try {
      const response = await request('/account/apple-authorization', body, 'old-token')
      expect(response.status).toBe(status)
      if (scenario === 'missing-client-id')
        expect(fetchRequest).not.toHaveBeenCalled()
      expect(await db.select().from(schema.session)).toHaveLength(1)
      expect((await db.select().from(schema.account))[0].refreshToken).toBeNull()
    }
    finally {
      env.AUTH_APPLE_CLIENT_ID = originalClientId
    }
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

  it.each(['missing-session', 'foreign-apple', 'nonce', 'audience', 'exchanged-subject', 'exchanged-nonce', 'copied-nonce', 'missing-refresh'])(
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
      if (scenario === 'copied-nonce')
        body.nonce = nonceHash
      if (scenario === 'missing-refresh')
        fetchRequest.mockResolvedValue(Response.json({ access_token: 'access', id_token: body.identityToken }))
      const response = await request('/account/apple-authorization', body, scenario === 'missing-session' ? '' : 'old-token')
      expect(response.status).toBeGreaterThanOrEqual(400)
      if (scenario === 'copied-nonce') {
        expect(response.status).toBe(401)
        expect(fetchRequest).not.toHaveBeenCalled()
      }
      const [account] = await db.select().from(schema.account)
      expect(account.refreshToken).toBeNull()
      expect(await db.select().from(schema.user)).toHaveLength(1)
      expect(await db.select().from(schema.session)).toHaveLength(1)
      expect(cleanup).not.toHaveBeenCalled()
    },
  )

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
})
