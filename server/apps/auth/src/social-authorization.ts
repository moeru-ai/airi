import type { AuthDatabase } from './db'
import type { AuthEnv } from './env'

import { Buffer } from 'node:buffer'

import { eq } from 'drizzle-orm'
import { importPKCS8, SignJWT } from 'jose'
import { literal, object, safeParse } from 'valibot'

import * as authSchema from '@proj-airi/auth-shared'

import { createBadGatewayError, createServiceUnavailableError } from './error'

type AppleCredentials = Pick<AuthEnv, 'AUTH_APPLE_CLIENT_ID' | 'AUTH_APPLE_TEAM_ID' | 'AUTH_APPLE_KEY_ID' | 'AUTH_APPLE_PRIVATE_KEY_PEM'>

type SocialAuthorizationCredentials = AppleCredentials & Pick<AuthEnv, 'AUTH_GITHUB_CLIENT_ID' | 'AUTH_GITHUB_CLIENT_SECRET'>

interface SocialAccount {
  providerId: string
  accessToken: string | null
  refreshToken: string | null
}

const GoogleInvalidTokenResponseSchema = object({
  error: literal('invalid_token'),
})

/** Revokes external social-provider authorizations retained for a user. */
export interface SocialAuthorizationRevoker {
  /**
   * Revokes every linked external authorization before the local user row is
   * deleted. Credential accounts are local-only and are intentionally ignored.
   */
  revokeForUser: (userId: string) => Promise<void>
}

/** Creates the signed client assertion required by Apple's token endpoints. */
export async function createAppleClientSecret(credentials: AppleCredentials): Promise<string> {
  const key = await importPKCS8(credentials.AUTH_APPLE_PRIVATE_KEY_PEM, 'ES256')
  const issuedAt = Math.floor(Date.now() / 1000)

  return await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: credentials.AUTH_APPLE_KEY_ID })
    .setIssuer(credentials.AUTH_APPLE_TEAM_ID)
    .setSubject(credentials.AUTH_APPLE_CLIENT_ID)
    .setAudience('https://appleid.apple.com')
    .setIssuedAt(issuedAt)
    // Apple caps client-secret JWT validity at six months.
    .setExpirationTime(issuedAt + 180 * 24 * 60 * 60)
    .sign(key)
}

function revocationToken(account: SocialAccount): { token: string, tokenType: 'refresh_token' | 'access_token' } {
  if (account.refreshToken)
    return { token: account.refreshToken, tokenType: 'refresh_token' }
  if (account.accessToken)
    return { token: account.accessToken, tokenType: 'access_token' }

  throw createServiceUnavailableError(
    `No ${account.providerId} token is available to revoke this authorization.`,
    'oauth/revocation_token_missing',
    { providerId: account.providerId },
  )
}

async function revokeAppleAuthorization(
  account: SocialAccount,
  credentials: SocialAuthorizationCredentials,
  fetchRequest: typeof fetch,
): Promise<void> {
  if (!credentials.AUTH_APPLE_CLIENT_ID
    || !credentials.AUTH_APPLE_TEAM_ID
    || !credentials.AUTH_APPLE_KEY_ID
    || !credentials.AUTH_APPLE_PRIVATE_KEY_PEM) {
    throw createServiceUnavailableError(
      'Apple authorization revocation is not configured.',
      'oauth/provider_not_configured',
      { providerId: 'apple' },
    )
  }

  const { token, tokenType } = revocationToken(account)
  const clientSecret = await createAppleClientSecret(credentials)
  const response = await fetchRequest('https://appleid.apple.com/auth/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: credentials.AUTH_APPLE_CLIENT_ID,
      client_secret: clientSecret,
      token,
      token_type_hint: tokenType,
    }),
  })

  if (!response.ok) {
    throw createBadGatewayError('Apple authorization revocation failed.', {
      providerId: 'apple',
      statusCode: response.status,
    })
  }
}

async function isInactiveGoogleToken(response: Response): Promise<boolean> {
  if (response.status !== 400)
    return false

  const body = await response.json().catch(() => undefined)
  return safeParse(GoogleInvalidTokenResponseSchema, body).success
}

async function revokeGoogleToken(token: string, fetchRequest: typeof fetch): Promise<'revoked' | 'inactive'> {
  const response = await fetchRequest('https://oauth2.googleapis.com/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }),
  })

  // Google reports expired and previously revoked tokens as invalid_token.
  // Either state means the saved credential can no longer authorize AIRI, so
  // accepting it makes a partially completed deletion safe to retry.
  if (response.ok)
    return 'revoked'
  if (await isInactiveGoogleToken(response))
    return 'inactive'

  throw createBadGatewayError('Google authorization revocation failed.', {
    providerId: 'google',
    statusCode: response.status,
  })
}

async function revokeGoogleAuthorization(account: SocialAccount, fetchRequest: typeof fetch): Promise<void> {
  const { token, tokenType } = revocationToken(account)
  const result = await revokeGoogleToken(token, fetchRequest)

  // An inactive refresh token cannot revoke a still-live access token. Try the
  // separately retained access token before accepting the authorization as
  // gone; Google links a successful access-token revocation back to its grant.
  if (result === 'inactive'
    && tokenType === 'refresh_token'
    && account.accessToken
    && account.accessToken !== token) {
    await revokeGoogleToken(account.accessToken, fetchRequest)
  }
}

function githubHeaders(credentials: SocialAuthorizationCredentials): Record<string, string> {
  return {
    'Accept': 'application/vnd.github+json',
    'Authorization': `Basic ${Buffer.from(`${credentials.AUTH_GITHUB_CLIENT_ID}:${credentials.AUTH_GITHUB_CLIENT_SECRET}`).toString('base64')}`,
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

async function revokeGitHubAuthorization(
  account: SocialAccount,
  credentials: SocialAuthorizationCredentials,
  fetchRequest: typeof fetch,
): Promise<void> {
  if (!credentials.AUTH_GITHUB_CLIENT_ID || !credentials.AUTH_GITHUB_CLIENT_SECRET) {
    throw createServiceUnavailableError(
      'GitHub authorization revocation is not configured.',
      'oauth/provider_not_configured',
      { providerId: 'github' },
    )
  }
  if (!account.accessToken) {
    throw createServiceUnavailableError(
      'No GitHub access token is available to revoke this application grant.',
      'oauth/revocation_token_missing',
      { providerId: 'github' },
    )
  }

  const headers = githubHeaders(credentials)
  const body = JSON.stringify({ access_token: account.accessToken })
  const applicationsUrl = `https://api.github.com/applications/${encodeURIComponent(credentials.AUTH_GITHUB_CLIENT_ID)}`
  const response = await fetchRequest(`${applicationsUrl}/grant`, {
    method: 'DELETE',
    headers,
    body,
  })

  if (response.status === 204)
    return

  // GitHub's delete endpoint does not document an idempotent "already gone"
  // status. Check the token after any failed delete: 404 is the documented
  // invalid-token response and proves that the grant can no longer be used.
  const verificationResponse = await fetchRequest(`${applicationsUrl}/token`, {
    method: 'POST',
    headers,
    body,
  })
  if (verificationResponse.status === 404 && !account.refreshToken)
    return

  throw createBadGatewayError('GitHub authorization revocation failed.', {
    providerId: 'github',
    statusCode: response.status,
    verificationStatusCode: verificationResponse.status,
  })
}

/**
 * Creates the provider-aware authorization boundary used by account deletion.
 *
 * Every configured social provider must have an explicit revocation policy.
 * Unknown providers abort deletion so a future login integration cannot
 * silently regress to deleting only AIRI's local account records.
 *
 * @see https://developer.apple.com/documentation/signinwithapplerestapi/revoke-tokens
 * @see https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke
 * @see https://docs.github.com/en/rest/apps/oauth-applications#delete-an-app-authorization
 */
export function createSocialAuthorizationRevoker(
  db: AuthDatabase,
  credentials: SocialAuthorizationCredentials,
  fetchRequest: typeof fetch = fetch,
): SocialAuthorizationRevoker {
  return {
    async revokeForUser(userId) {
      const accounts = await db
        .select({
          providerId: authSchema.account.providerId,
          accessToken: authSchema.account.accessToken,
          refreshToken: authSchema.account.refreshToken,
        })
        .from(authSchema.account)
        .where(eq(authSchema.account.userId, userId))

      for (const account of accounts) {
        if (account.providerId === 'credential')
          continue
        if (account.providerId === 'apple') {
          await revokeAppleAuthorization(account, credentials, fetchRequest)
          continue
        }
        if (account.providerId === 'google') {
          await revokeGoogleAuthorization(account, fetchRequest)
          continue
        }
        if (account.providerId === 'github') {
          await revokeGitHubAuthorization(account, credentials, fetchRequest)
          continue
        }

        throw createServiceUnavailableError(
          `Authorization revocation is not implemented for ${account.providerId}.`,
          'oauth/revocation_not_supported',
          { providerId: account.providerId },
        )
      }
    },
  }
}
