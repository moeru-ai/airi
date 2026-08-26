import type { AuthDatabase } from '../db'
import type { AuthEnv } from '../env'

import { Buffer } from 'node:buffer'
import { generateKeyPairSync } from 'node:crypto'

import { decodeJwt } from 'jose'
import { describe, expect, it, vi } from 'vitest'

import { createSocialAuthorizationRevoker } from '../social-authorization'

interface SocialAccount {
  providerId: string
  accessToken: string | null
  refreshToken: string | null
}

function createCredentials(): Pick<AuthEnv, 'AUTH_GOOGLE_CLIENT_ID' | 'AUTH_GOOGLE_CLIENT_SECRET' | 'AUTH_GITHUB_CLIENT_ID' | 'AUTH_GITHUB_CLIENT_SECRET' | 'AUTH_APPLE_CLIENT_ID' | 'AUTH_APPLE_TEAM_ID' | 'AUTH_APPLE_KEY_ID' | 'AUTH_APPLE_PRIVATE_KEY_PEM'> {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })

  return {
    AUTH_GOOGLE_CLIENT_ID: 'google-client-id',
    AUTH_GOOGLE_CLIENT_SECRET: 'google-client-secret',
    AUTH_GITHUB_CLIENT_ID: 'github-client-id',
    AUTH_GITHUB_CLIENT_SECRET: 'github-client-secret',
    AUTH_APPLE_CLIENT_ID: 'apple-service-id',
    AUTH_APPLE_TEAM_ID: 'apple-team-id',
    AUTH_APPLE_KEY_ID: 'apple-key-id',
    AUTH_APPLE_PRIVATE_KEY_PEM: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  }
}

function createAccountDb(accounts: SocialAccount[]): AuthDatabase {
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => accounts),
      })),
    })),
  } as unknown as AuthDatabase
}

describe('social authorization revocation', () => {
  it('revokes the saved Apple refresh token', async () => {
    const fetchRequest = vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }))
    const revoker = createSocialAuthorizationRevoker(
      createAccountDb([{ providerId: 'apple', accessToken: 'apple-access-token', refreshToken: 'apple-refresh-token' }]),
      createCredentials(),
      fetchRequest,
    )

    await revoker.revokeForUser('user-1')

    expect(fetchRequest).toHaveBeenCalledTimes(1)
    const [url, init] = fetchRequest.mock.calls[0]
    expect(url.toString()).toBe('https://appleid.apple.com/auth/revoke')
    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded' })

    const body = new URLSearchParams(init?.body?.toString())
    expect(body.get('client_id')).toBe('apple-service-id')
    expect(body.get('token')).toBe('apple-refresh-token')
    expect(body.get('token_type_hint')).toBe('refresh_token')

    const clientSecret = body.get('client_secret')
    if (!clientSecret)
      throw new TypeError('Expected Apple client secret')
    const claims = decodeJwt(clientSecret)
    expect(claims.iss).toBe('apple-team-id')
    expect(claims.sub).toBe('apple-service-id')
    expect(claims.aud).toBe('https://appleid.apple.com')
  })

  it('uses the Apple access token when no refresh token was retained', async () => {
    const fetchRequest = vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }))
    const revoker = createSocialAuthorizationRevoker(
      createAccountDb([{ providerId: 'apple', accessToken: 'apple-access-token', refreshToken: null }]),
      createCredentials(),
      fetchRequest,
    )

    await revoker.revokeForUser('user-1')

    const [, init] = fetchRequest.mock.calls[0]
    const body = new URLSearchParams(init?.body?.toString())
    expect(body.get('token')).toBe('apple-access-token')
    expect(body.get('token_type_hint')).toBe('access_token')
  })

  it('aborts deletion when Apple rejects revocation', async () => {
    const revoker = createSocialAuthorizationRevoker(
      createAccountDb([{ providerId: 'apple', accessToken: null, refreshToken: 'apple-refresh-token' }]),
      createCredentials(),
      vi.fn<typeof fetch>(async () => Response.json({ error: 'invalid_client' }, { status: 400 })),
    )

    await expect(revoker.revokeForUser('user-1')).rejects.toMatchObject({
      statusCode: 502,
      errorCode: 'BAD_GATEWAY',
      details: { providerId: 'apple', statusCode: 400 },
    })
  })

  it('revokes Google with the refresh token when available', async () => {
    const fetchRequest = vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }))
    const revoker = createSocialAuthorizationRevoker(
      createAccountDb([{ providerId: 'google', accessToken: 'google-access-token', refreshToken: 'google-refresh-token' }]),
      createCredentials(),
      fetchRequest,
    )

    await revoker.revokeForUser('user-1')

    expect(fetchRequest).toHaveBeenCalledTimes(1)
    const [url, init] = fetchRequest.mock.calls[0]
    expect(url.toString()).toBe('https://oauth2.googleapis.com/revoke')
    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded' })
    expect(new URLSearchParams(init?.body?.toString()).get('token')).toBe('google-refresh-token')
  })

  it('treats an already invalid Google token as revoked on retry', async () => {
    const revoker = createSocialAuthorizationRevoker(
      createAccountDb([{ providerId: 'google', accessToken: 'google-access-token', refreshToken: null }]),
      createCredentials(),
      vi.fn<typeof fetch>(async () => Response.json({ error: 'invalid_token' }, { status: 400 })),
    )

    await expect(revoker.revokeForUser('user-1')).resolves.toBeUndefined()
  })

  it('falls back to the Google access token when the refresh token is inactive', async () => {
    const fetchRequest = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ error: 'invalid_token' }, { status: 400 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
    const revoker = createSocialAuthorizationRevoker(
      createAccountDb([{ providerId: 'google', accessToken: 'google-access-token', refreshToken: 'google-refresh-token' }]),
      createCredentials(),
      fetchRequest,
    )

    await revoker.revokeForUser('user-1')

    expect(fetchRequest).toHaveBeenCalledTimes(2)
    const [, accessTokenRequest] = fetchRequest.mock.calls[1]
    expect(new URLSearchParams(accessTokenRequest?.body?.toString()).get('token')).toBe('google-access-token')
  })

  it('deletes the GitHub application grant with app authentication', async () => {
    const fetchRequest = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }))
    const revoker = createSocialAuthorizationRevoker(
      createAccountDb([{ providerId: 'github', accessToken: 'github-access-token', refreshToken: null }]),
      createCredentials(),
      fetchRequest,
    )

    await revoker.revokeForUser('user-1')

    expect(fetchRequest).toHaveBeenCalledTimes(1)
    const [url, init] = fetchRequest.mock.calls[0]
    expect(url.toString()).toBe('https://api.github.com/applications/github-client-id/grant')
    expect(init?.method).toBe('DELETE')
    expect(init?.headers).toEqual({
      'Accept': 'application/vnd.github+json',
      'Authorization': `Basic ${Buffer.from('github-client-id:github-client-secret').toString('base64')}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    })
    expect(init?.body).toBe('{"access_token":"github-access-token"}')
  })

  it('accepts a missing GitHub token after a retry verifies it is gone', async () => {
    const fetchRequest = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 422 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
    const revoker = createSocialAuthorizationRevoker(
      createAccountDb([{ providerId: 'github', accessToken: 'github-access-token', refreshToken: null }]),
      createCredentials(),
      fetchRequest,
    )

    await expect(revoker.revokeForUser('user-1')).resolves.toBeUndefined()

    expect(fetchRequest).toHaveBeenCalledTimes(2)
    const [url, init] = fetchRequest.mock.calls[1]
    expect(url.toString()).toBe('https://api.github.com/applications/github-client-id/token')
    expect(init?.method).toBe('POST')
  })

  it('aborts deletion when GitHub still reports the token as active', async () => {
    const fetchRequest = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ id: 1 }, { status: 200 }))
    const revoker = createSocialAuthorizationRevoker(
      createAccountDb([{ providerId: 'github', accessToken: 'github-access-token', refreshToken: null }]),
      createCredentials(),
      fetchRequest,
    )

    await expect(revoker.revokeForUser('user-1')).rejects.toMatchObject({
      statusCode: 502,
      errorCode: 'BAD_GATEWAY',
      details: { providerId: 'github', statusCode: 503, verificationStatusCode: 200 },
    })
  })

  it('does not treat an invalid GitHub access token as revoked while a refresh token remains', async () => {
    const fetchRequest = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 422 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
    const revoker = createSocialAuthorizationRevoker(
      createAccountDb([{ providerId: 'github', accessToken: 'github-access-token', refreshToken: 'github-refresh-token' }]),
      createCredentials(),
      fetchRequest,
    )

    await expect(revoker.revokeForUser('user-1')).rejects.toMatchObject({
      statusCode: 502,
      details: { providerId: 'github', statusCode: 422, verificationStatusCode: 404 },
    })
  })

  it('ignores credential accounts because they have no external grant', async () => {
    const fetchRequest = vi.fn<typeof fetch>()
    const revoker = createSocialAuthorizationRevoker(
      createAccountDb([{ providerId: 'credential', accessToken: null, refreshToken: null }]),
      createCredentials(),
      fetchRequest,
    )

    await revoker.revokeForUser('user-1')

    expect(fetchRequest).not.toHaveBeenCalled()
  })

  it('aborts deletion when a social account has no revocable token', async () => {
    const revoker = createSocialAuthorizationRevoker(
      createAccountDb([{ providerId: 'google', accessToken: null, refreshToken: null }]),
      createCredentials(),
      vi.fn<typeof fetch>(),
    )

    await expect(revoker.revokeForUser('user-1')).rejects.toMatchObject({
      statusCode: 503,
      errorCode: 'oauth/revocation_token_missing',
      details: { providerId: 'google' },
    })
  })

  it('aborts deletion for an external provider without a revocation policy', async () => {
    const revoker = createSocialAuthorizationRevoker(
      createAccountDb([{ providerId: 'future-provider', accessToken: 'token', refreshToken: null }]),
      createCredentials(),
      vi.fn<typeof fetch>(),
    )

    await expect(revoker.revokeForUser('user-1')).rejects.toMatchObject({
      statusCode: 503,
      errorCode: 'oauth/revocation_not_supported',
      details: { providerId: 'future-provider' },
    })
  })
})
