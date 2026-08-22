import type { AuthDatabase } from '../db'
import type { AuthEnv } from '../env'

import { generateKeyPairSync } from 'node:crypto'

import { getAuthTables } from 'better-auth/db'
import { decodeJwt, decodeProtectedHeader, importSPKI, jwtVerify } from 'jose'
import { describe, expect, it, vi } from 'vitest'

import { createAuth, ensureDynamicFirstPartyRedirectUri, seedTrustedClients } from '../auth'

function createMockDb(existingRowsByCall: unknown[][] = []) {
  const limit = vi.fn()
  for (const rows of existingRowsByCall) {
    limit.mockResolvedValueOnce(rows)
  }

  const capturedValues: any[] = []
  const values = vi.fn(async (value: any) => {
    capturedValues.push(value)
  })

  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit,
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values,
    })),
  }

  return { db, limit, values, capturedValues }
}

describe('createAuth', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const applePrivateKey = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  const applePublicKey = publicKey.export({ type: 'spki', format: 'pem' }).toString()

  it('allows signed-in users to link OAuth accounts that use a different email', () => {
    const auth = createAuth({} as unknown as AuthDatabase, {
      PUBLIC_URL: 'http://localhost:3000',
      AUTH_GOOGLE_CLIENT_ID: 'google-client',
      AUTH_GOOGLE_CLIENT_SECRET: 'google-secret',
      AUTH_GITHUB_CLIENT_ID: 'github-client',
      AUTH_GITHUB_CLIENT_SECRET: 'github-secret',
      AUTH_APPLE_CLIENT_ID: 'apple-service-id',
      AUTH_APPLE_APP_BUNDLE_IDENTIFIERS: ['ai.moeru.airi-pocket', 'ai.moeru.airi-pro'],
      AUTH_APPLE_TEAM_ID: 'apple-team-id',
      AUTH_APPLE_KEY_ID: 'apple-key-id',
      AUTH_APPLE_PRIVATE_KEY_PEM: applePrivateKey,
      BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret',
      ADDITIONAL_TRUSTED_ORIGINS: [],
    } as unknown as AuthEnv)

    expect(auth.options.account?.accountLinking?.allowDifferentEmails).toBe(true)
  })

  it('registers lastSeenAt as a server-managed Better Auth user field', () => {
    const auth = createAuth({} as unknown as AuthDatabase, {
      PUBLIC_URL: 'http://localhost:3000',
      AUTH_GOOGLE_CLIENT_ID: 'google-client',
      AUTH_GOOGLE_CLIENT_SECRET: 'google-secret',
      AUTH_GITHUB_CLIENT_ID: 'github-client',
      AUTH_GITHUB_CLIENT_SECRET: 'github-secret',
      BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret',
      ADDITIONAL_TRUSTED_ORIGINS: [],
    } as unknown as AuthEnv)

    expect(auth.options.user?.additionalFields?.lastSeenAt).toMatchObject({
      type: 'date',
      required: false,
      input: false,
      returned: true,
    })
    expect(getAuthTables(auth.options).user.fields.lastSeenAt).toMatchObject({
      type: 'date',
      required: false,
      input: false,
      returned: true,
    })
  })

  it('asks social providers to show the account picker during OAuth authorization', () => {
    const auth = createAuth({} as unknown as AuthDatabase, {
      PUBLIC_URL: 'http://localhost:3000',
      AUTH_GOOGLE_CLIENT_ID: 'google-client',
      AUTH_GOOGLE_CLIENT_SECRET: 'google-secret',
      AUTH_GITHUB_CLIENT_ID: 'github-client',
      AUTH_GITHUB_CLIENT_SECRET: 'github-secret',
      AUTH_APPLE_CLIENT_ID: 'apple-service-id',
      AUTH_APPLE_APP_BUNDLE_IDENTIFIERS: ['ai.moeru.airi-pocket', 'ai.moeru.airi-pro'],
      AUTH_APPLE_TEAM_ID: 'apple-team-id',
      AUTH_APPLE_KEY_ID: 'apple-key-id',
      AUTH_APPLE_PRIVATE_KEY_PEM: applePrivateKey,
      BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret',
      ADDITIONAL_TRUSTED_ORIGINS: [],
    } as unknown as AuthEnv)

    const google = auth.options.socialProviders?.google
    const github = auth.options.socialProviders?.github
    if (!google || typeof google === 'function' || !github || typeof github === 'function')
      throw new TypeError('Expected synchronous Google and GitHub provider configuration')
    expect(google.prompt).toBe('select_account')
    expect(github.prompt).toBe('select_account')
  })

  it('does not register Apple when its optional credentials are absent', () => {
    const auth = createAuth({} as unknown as AuthDatabase, {
      PUBLIC_URL: 'http://localhost:3000',
      AUTH_GOOGLE_CLIENT_ID: 'google-client',
      AUTH_GOOGLE_CLIENT_SECRET: 'google-secret',
      AUTH_GITHUB_CLIENT_ID: 'github-client',
      AUTH_GITHUB_CLIENT_SECRET: 'github-secret',
      AUTH_APPLE_CLIENT_ID: '',
      AUTH_APPLE_APP_BUNDLE_IDENTIFIERS: [],
      AUTH_APPLE_TEAM_ID: '',
      AUTH_APPLE_KEY_ID: '',
      AUTH_APPLE_PRIVATE_KEY_PEM: '',
      BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret',
      ADDITIONAL_TRUSTED_ORIGINS: [],
    } as unknown as AuthEnv)

    expect(auth.options.socialProviders?.apple).toBeUndefined()
  })

  it('does not register Apple when its optional credentials are incomplete', () => {
    const auth = createAuth({} as unknown as AuthDatabase, {
      PUBLIC_URL: 'http://localhost:3000',
      AUTH_GOOGLE_CLIENT_ID: 'google-client',
      AUTH_GOOGLE_CLIENT_SECRET: 'google-secret',
      AUTH_GITHUB_CLIENT_ID: 'github-client',
      AUTH_GITHUB_CLIENT_SECRET: 'github-secret',
      AUTH_APPLE_CLIENT_ID: 'apple-service-id',
      AUTH_APPLE_APP_BUNDLE_IDENTIFIERS: ['ai.moeru.airi-pocket', 'ai.moeru.airi-pro'],
      AUTH_APPLE_TEAM_ID: 'apple-team-id',
      AUTH_APPLE_KEY_ID: 'apple-key-id',
      AUTH_APPLE_PRIVATE_KEY_PEM: '',
      BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret',
      ADDITIONAL_TRUSTED_ORIGINS: [],
    } as unknown as AuthEnv)

    expect(auth.options.socialProviders?.apple).toBeUndefined()
  })

  it('configures Apple for web OAuth and native ID-token sign-in', async () => {
    const auth = createAuth({} as unknown as AuthDatabase, {
      PUBLIC_URL: 'http://localhost:3000',
      AUTH_GOOGLE_CLIENT_ID: 'google-client',
      AUTH_GOOGLE_CLIENT_SECRET: 'google-secret',
      AUTH_GITHUB_CLIENT_ID: 'github-client',
      AUTH_GITHUB_CLIENT_SECRET: 'github-secret',
      AUTH_APPLE_CLIENT_ID: 'apple-service-id',
      AUTH_APPLE_APP_BUNDLE_IDENTIFIERS: ['ai.moeru.airi-pocket', 'ai.moeru.airi-pro'],
      AUTH_APPLE_TEAM_ID: 'apple-team-id',
      AUTH_APPLE_KEY_ID: 'apple-key-id',
      AUTH_APPLE_PRIVATE_KEY_PEM: applePrivateKey,
      BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret',
      ADDITIONAL_TRUSTED_ORIGINS: [],
    } as unknown as AuthEnv)

    const appleProvider = auth.options.socialProviders?.apple
    expect(typeof appleProvider).toBe('function')
    if (typeof appleProvider !== 'function')
      throw new TypeError('Expected Apple provider to use async configuration')

    const config = await appleProvider()
    if (!config.clientSecret)
      throw new TypeError('Expected Apple client-secret JWT')
    const header = decodeProtectedHeader(config.clientSecret)
    const claims = decodeJwt(config.clientSecret)
    const verificationKey = await importSPKI(applePublicKey, 'ES256')

    await expect(jwtVerify(config.clientSecret, verificationKey, {
      algorithms: ['ES256'],
      issuer: 'apple-team-id',
      subject: 'apple-service-id',
      audience: 'https://appleid.apple.com',
    })).resolves.toBeDefined()
    expect(config.clientId).toBe('apple-service-id')
    expect(config.audience).toEqual([
      'apple-service-id',
      'ai.moeru.airi-pocket',
      'ai.moeru.airi-pro',
    ])
    expect(header).toMatchObject({ alg: 'ES256', kid: 'apple-key-id' })
    expect(claims.exp! - claims.iat!).toBe(180 * 24 * 60 * 60)
    expect(await config.mapProfileToUser?.({
      sub: 'apple-user-id',
      email: '',
      email_verified: true,
      is_private_email: false,
      real_user_status: 2,
      name: '',
      picture: '',
    })).toEqual({
      email: 'apple-user-id@apple.placeholder.local',
    })
    expect(await config.mapProfileToUser?.({
      sub: 'apple-user-id',
      email: 'relay@privaterelay.appleid.com',
      email_verified: true,
      is_private_email: true,
      real_user_status: 2,
      name: '',
      picture: '',
    })).toEqual({
      email: 'relay@privaterelay.appleid.com',
    })

    const trustedOrigins = auth.options.trustedOrigins
    expect(typeof trustedOrigins).toBe('function')
    if (typeof trustedOrigins !== 'function')
      throw new TypeError('Expected request-aware trusted origins')
    expect(await trustedOrigins(new Request('http://localhost:3000/api/auth/sign-in/social'))).toContain('https://appleid.apple.com')
  })

  it('revokes external authorizations before deleting resource data', async () => {
    const calls: string[] = []
    const auth = createAuth(
      {} as unknown as AuthDatabase,
      {
        PUBLIC_URL: 'http://localhost:3000',
        AUTH_GOOGLE_CLIENT_ID: 'google-client',
        AUTH_GOOGLE_CLIENT_SECRET: 'google-secret',
        AUTH_GITHUB_CLIENT_ID: 'github-client',
        AUTH_GITHUB_CLIENT_SECRET: 'github-secret',
        BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret',
        ADDITIONAL_TRUSTED_ORIGINS: [],
      } as unknown as AuthEnv,
      undefined,
      undefined,
      {
        async softDeleteUserData() {
          calls.push('resource-data')
        },
        async trackAuthEvent() {},
      },
      {
        async revokeForUser() {
          calls.push('external-authorizations')
        },
      },
    )

    const beforeDelete = auth.options.user?.deleteUser?.beforeDelete
    if (!beforeDelete)
      throw new TypeError('Expected account-deletion hook')

    await beforeDelete({
      id: 'user-1',
      name: 'User One',
      email: 'user@example.com',
      emailVerified: true,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }, new Request('http://localhost:3000/api/auth/delete-user'))

    expect(calls).toEqual(['external-authorizations', 'resource-data'])
  })

  it('uses the Caddy public API origin as the Better Auth base URL', () => {
    const auth = createAuth({} as unknown as AuthDatabase, {
      PUBLIC_URL: 'https://api.airi.build',
      AUTH_GOOGLE_CLIENT_ID: 'google-client',
      AUTH_GOOGLE_CLIENT_SECRET: 'google-secret',
      AUTH_GITHUB_CLIENT_ID: 'github-client',
      AUTH_GITHUB_CLIENT_SECRET: 'github-secret',
      BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret',
      ADDITIONAL_TRUSTED_ORIGINS: [],
    } as unknown as AuthEnv)

    expect(auth.options.baseURL).toBe('https://api.airi.build')
  })
})

describe('seedTrustedClients', () => {
  it('seeds trusted first-party clients with explicit oauth metadata', async () => {
    const { db, values, capturedValues } = createMockDb([[], [], []])

    await seedTrustedClients(db as any, {
      PUBLIC_URL: 'http://localhost:3000',
    } as any)

    expect(values).toHaveBeenCalledTimes(3)

    // Web — public client (no secret, PKCE only)
    const webClient = capturedValues[0]
    if (!webClient)
      throw new Error('Expected web client seed insert')

    expect(webClient.clientId).toBe('airi-stage-web')
    expect(webClient.clientSecret).toBeNull()
    expect(webClient.public).toBe(true)
    // Includes default URIs + derived from PUBLIC_URL (localhost:3000)
    expect(webClient.redirectUris).toEqual([
      'https://airi.moeru.ai/auth/callback',
      'http://localhost:5173/auth/callback',
      'http://localhost:4173/auth/callback',
      'http://localhost:3000/auth/callback',
    ])
    expect(webClient.scopes).toEqual(['openid', 'profile', 'email', 'offline_access'])
    expect(webClient.grantTypes).toEqual(['authorization_code', 'refresh_token'])
    expect(webClient.responseTypes).toEqual(['code'])
    expect(webClient.tokenEndpointAuthMethod).toBe('none')
    expect(webClient.requirePKCE).toBe(true)
    expect(webClient.skipConsent).toBe(true)

    // Electron — public native client (PKCE only)
    const electronClient = capturedValues[1]
    if (!electronClient)
      throw new Error('Expected electron client seed insert')

    expect(electronClient.clientId).toBe('airi-stage-electron')
    expect(electronClient.clientSecret).toBeNull()
    expect(electronClient.public).toBe(true)
    expect(electronClient.tokenEndpointAuthMethod).toBe('none')
    expect(electronClient.redirectUris).toEqual([
      'http://localhost:3000/api/auth/oidc/electron-callback',
    ])

    // Mobile — public client (no secret, PKCE only)
    const pocketClient = capturedValues[2]
    if (!pocketClient)
      throw new Error('Expected pocket client seed insert')

    expect(pocketClient.clientId).toBe('airi-stage-pocket')
    expect(pocketClient.clientSecret).toBeNull()
    expect(pocketClient.public).toBe(true)
    expect(pocketClient.tokenEndpointAuthMethod).toBe('none')
    expect(pocketClient.redirectUris).toEqual([
      'capacitor://localhost/auth/callback',
      'ai.moeru.airi-pocket://links/auth/callback',
    ])
  })

  it('updates existing clients to match current config', async () => {
    const setCalls: any[] = []
    const set = vi.fn((vals: any) => {
      setCalls.push(vals)
      return { where: vi.fn() }
    })

    const { db, values } = createMockDb([
      [{ clientId: 'airi-stage-web' }],
      [],
      [],
    ]);
    (db as any).update = vi.fn(() => ({ set }))

    await seedTrustedClients(db as any, {
      PUBLIC_URL: 'http://localhost:3000',
    } as any)

    expect(values).toHaveBeenCalledTimes(2)
    expect(set).toHaveBeenCalledTimes(1)
    expect(setCalls[0].public).toBe(true)
    expect(setCalls[0].tokenEndpointAuthMethod).toBe('none')
    expect(setCalls[0].clientSecret).toBeNull()
  })

  it('registers the Electron callback on the public API origin', async () => {
    const { db, capturedValues } = createMockDb([[], [], []])

    await seedTrustedClients(db as any, {
      PUBLIC_URL: 'https://api.airi.build',
    } as any)

    expect(capturedValues[1].redirectUris).toEqual([
      'https://api.airi.build/api/auth/oidc/electron-callback',
    ])
  })
})

describe('ensureDynamicFirstPartyRedirectUri', () => {
  it('appends a trusted web callback redirect URI discovered from the authorize request', async () => {
    const setCalls: any[] = []
    const updateWhere = vi.fn()
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              { redirectUris: ['https://airi.moeru.ai/auth/callback'] },
            ]),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn((value: any) => {
          setCalls.push(value)
          return { where: updateWhere }
        }),
      })),
    }

    await ensureDynamicFirstPartyRedirectUri(
      db as any,
      new Request('https://api.airi.build/api/auth/oauth2/authorize?client_id=airi-stage-web&redirect_uri=https%3A%2F%2Fpreview.kwaa.workers.dev%2Fauth%2Fcallback'),
      [],
    )

    expect(setCalls).toHaveLength(1)
    expect(setCalls[0].redirectUris).toEqual([
      'https://airi.moeru.ai/auth/callback',
      'https://preview.kwaa.workers.dev/auth/callback',
    ])
    expect(updateWhere).toHaveBeenCalledTimes(1)
  })

  it('appends a same-origin electron relay redirect URI discovered from the authorize request', async () => {
    const setCalls: any[] = []
    const updateWhere = vi.fn()
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              { redirectUris: ['https://api.airi.build/api/auth/oidc/electron-callback'] },
            ]),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn((value: any) => {
          setCalls.push(value)
          return { where: updateWhere }
        }),
      })),
    }

    await ensureDynamicFirstPartyRedirectUri(
      db as any,
      new Request('https://airi-server-dev.up.railway.app/api/auth/oauth2/authorize?client_id=airi-stage-electron&redirect_uri=https%3A%2F%2Fairi-server-dev.up.railway.app%2Fapi%2Fauth%2Foidc%2Felectron-callback'),
      [],
    )

    expect(setCalls).toHaveLength(1)
    expect(setCalls[0].redirectUris).toEqual([
      'https://api.airi.build/api/auth/oidc/electron-callback',
      'https://airi-server-dev.up.railway.app/api/auth/oidc/electron-callback',
    ])
    expect(updateWhere).toHaveBeenCalledTimes(1)
  })

  it('ignores untrusted or non-callback redirect URIs', async () => {
    const db = {
      select: vi.fn(),
      update: vi.fn(),
    }

    await ensureDynamicFirstPartyRedirectUri(
      db as any,
      new Request('https://api.airi.build/api/auth/oauth2/authorize?client_id=airi-stage-web&redirect_uri=https%3A%2F%2Fevil.example%2Fauth%2Fcallback'),
      [],
    )

    await ensureDynamicFirstPartyRedirectUri(
      db as any,
      new Request('https://api.airi.build/api/auth/oauth2/authorize?client_id=airi-stage-web&redirect_uri=https%3A%2F%2Fairi.moeru.ai%2Fother-path'),
      [],
    )

    await ensureDynamicFirstPartyRedirectUri(
      db as any,
      new Request('https://api.airi.build/api/auth/oauth2/authorize?client_id=airi-stage-electron&redirect_uri=https%3A%2F%2Fother.example%2Fapi%2Fauth%2Foidc%2Felectron-callback'),
      [],
    )

    expect(db.select).not.toHaveBeenCalled()
    expect(db.update).not.toHaveBeenCalled()
  })
})
