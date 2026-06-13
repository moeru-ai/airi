import type { AuthInstance } from './auth'
import type { Env } from './env'

import { createHmac } from 'node:crypto'

import { generateRandomString } from 'better-auth/crypto'
import { generateCodeChallenge } from 'better-auth/oauth2'

import { OIDC_CLIENT_ID_ELECTRON, OIDC_SCOPES } from './auth'

export interface ElectronOidcTokenBundle {
  accessToken: string
  refreshToken?: string
  idToken?: string
  expiresIn: number
}

interface OidcTokenResponseJson {
  access_token: string
  refresh_token?: string
  id_token?: string
  expires_in: number
}

/**
 * Signs a better-auth session token for use in the session cookie.
 *
 * NOTICE:
 * Mirrors `oidc-jwt-bearer` / bearer() cookie format so `/oauth2/authorize`
 * accepts the session. Source: apps/server/src/libs/auth-plugins/oidc-jwt-bearer.ts
 */
function signSessionCookieValue(value: string, secret: string): string {
  const signature = createHmac('sha256', secret).update(value).digest('base64')
  return encodeURIComponent(`${value}.${signature}`)
}

/** Issues Electron OIDC tokens via in-process authorization-code + PKCE. */
export async function mintElectronOidcTokens(params: {
  auth: AuthInstance
  env: Env
  userId: string
}): Promise<ElectronOidcTokenBundle> {
  const ctx = await params.auth.$context
  const session = await ctx.internalAdapter.createSession(params.userId)
  if (!session?.token)
    throw new Error('Failed to create session for Steam sign-in')

  const codeVerifier = generateRandomString(64, 'A-Z', 'a-z')
  const codeChallenge = await generateCodeChallenge(codeVerifier)
  const state = generateRandomString(32, 'A-Z', 'a-z')
  const redirectUri = `${params.env.API_SERVER_URL}/api/auth/oidc/electron-callback`
  const scopes = OIDC_SCOPES.join(' ')

  const cookieName = ctx.authCookies.sessionToken.name
  const signedSession = signSessionCookieValue(session.token, ctx.secret)
  const sessionCookie = `${cookieName}=${signedSession}`

  const authorizeUrl = new URL('/api/auth/oauth2/authorize', params.env.API_SERVER_URL)
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('client_id', OIDC_CLIENT_ID_ELECTRON)
  authorizeUrl.searchParams.set('redirect_uri', redirectUri)
  authorizeUrl.searchParams.set('scope', scopes)
  authorizeUrl.searchParams.set('state', state)
  authorizeUrl.searchParams.set('code_challenge', codeChallenge)
  authorizeUrl.searchParams.set('code_challenge_method', 'S256')
  authorizeUrl.searchParams.set('resource', params.env.API_SERVER_URL)

  const authorizeResponse = await params.auth.handler(new Request(authorizeUrl, {
    method: 'GET',
    headers: { cookie: sessionCookie },
  }))

  if (authorizeResponse.status !== 302 && authorizeResponse.status !== 303) {
    const body = await authorizeResponse.text()
    throw new Error(`OIDC authorize failed (${authorizeResponse.status}): ${body}`)
  }

  const location = authorizeResponse.headers.get('location')
  if (!location)
    throw new Error('OIDC authorize missing redirect location')

  const callbackUrl = new URL(location, params.env.API_SERVER_URL)
  const code = callbackUrl.searchParams.get('code')
  if (!code)
    throw new Error('OIDC authorize redirect missing authorization code')

  const tokenBody = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: OIDC_CLIENT_ID_ELECTRON,
    code_verifier: codeVerifier,
    resource: params.env.API_SERVER_URL,
  })

  const tokenResponse = await params.auth.handler(new Request(
    new URL('/api/auth/oauth2/token', params.env.API_SERVER_URL),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody,
    },
  ))

  if (!tokenResponse.ok) {
    const text = await tokenResponse.text()
    throw new Error(`OIDC token exchange failed (${tokenResponse.status}): ${text}`)
  }

  const data = await tokenResponse.json() as OidcTokenResponseJson
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    idToken: data.id_token,
    expiresIn: data.expires_in,
  }
}
