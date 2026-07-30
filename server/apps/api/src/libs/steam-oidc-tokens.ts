import type { AuthInstance } from './auth'
import type { Env } from './env'

import { createHmac } from 'node:crypto'

import { generateRandomString } from 'better-auth/crypto'

import { createForbiddenError } from '../utils/error'
import { OIDC_CLIENT_ID_ELECTRON, OIDC_SCOPES } from './auth'
import { isUserBannedNow } from './request-auth'

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

/**
 * Issues a short-lived Electron OIDC authorization code via in-process
 * `/oauth2/authorize`, binding the caller's `code_challenge`.
 *
 * The Electron client must complete PKCE at `/oauth2/token` with the matching
 * `code_verifier`. `redirect_uri` / scopes / `resource` are fixed to the
 * trusted Electron client registration.
 *
 * NOTICE:
 * better-auth binds the authorization code to a session row. That session must
 * still exist when `/oauth2/token` runs, so this helper does not delete the
 * session after issuing the code. Cleanup belongs to a later grant that can
 * mint codes without a browser session.
 *
 * Ban check:
 * Callers (e.g. Steam desktop ticket sign-in) mint sessions via
 * `internalAdapter.createSession` outside a better-auth HTTP endpoint. The
 * admin plugin's `session.create.before` hook no-ops when `ctx` is missing
 * (`if (!ctx) return`), so we reject banned users here before creating the
 * session — matching normal OAuth/OpenID login endpoints that do have `ctx`.
 */
export async function issueElectronOidcCode(params: {
  auth: AuthInstance
  env: Env
  userId: string
  codeChallenge: string
}): Promise<string> {
  const ctx = await params.auth.$context
  // NOTICE:
  // internalAdapter.findUserById is typed as better-auth's base User and omits
  // the admin-plugin fields (banned/banExpires), but the query selects the full
  // row so the runtime value carries them.
  // Removal condition: better-auth's adapter return type includes plugin fields.
  // Source/context: same pattern as `resolveRequestAuth` in request-auth.ts.
  const userForBanCheck = await ctx.internalAdapter.findUserById(params.userId) as {
    banned?: boolean | null
    banExpires?: Date | string | null
  } | null
  if (userForBanCheck && isUserBannedNow(userForBanCheck))
    throw createForbiddenError('This account has been banned')

  const session = await ctx.internalAdapter.createSession(params.userId)
  if (!session?.token)
    throw new Error('Failed to create session for Steam sign-in')

  // Throwaway CSRF state: the code is returned in JSON, not via browser redirect.
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
  authorizeUrl.searchParams.set('code_challenge', params.codeChallenge)
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

  return code
}
