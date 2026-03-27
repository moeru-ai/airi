import type { AuthInstance } from '../libs/auth'
import type { HonoEnv } from '../types/hono'

import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'

import { createBadRequestError, createUnauthorizedError } from '../utils/error'
import { getTrustedOrigin } from '../utils/origin'

/**
 * Auth routes handle OAuth login flows and JWT token management.
 *
 * Flow:
 * 1. Client calls GET /login/:provider → redirects to OAuth provider
 * 2. Provider redirects to GET /callback/:provider → server exchanges code for tokens
 * 3. Server creates/finds user, generates JWT access + refresh tokens
 * 4. Server redirects client back with tokens as URL params
 * 5. Client stores tokens and sends access token via Authorization header
 * 6. POST /refresh → exchange refresh token for new access token
 * 7. POST /sign-out → revoke refresh token
 */
export function createAuthRoutes(auth: AuthInstance): Hono<HonoEnv> {
  const app = new Hono<HonoEnv>()

  /**
   * GET /login/:provider
   * Initiates OAuth login by redirecting to the provider's authorization page.
   * Stores OAuth state and code verifier in HTTP-only cookies for CSRF protection.
   */
  app.get('/login/:provider', async (c) => {
    const provider = c.req.param('provider')
    const redirectTo = c.req.query('redirect') ?? '/'

    const { state, codeVerifier } = auth.createOAuthState()

    // Store state and code verifier in short-lived HTTP-only cookies
    const cookieOptions = {
      httpOnly: true,
      secure: true,
      path: '/',
      maxAge: 600, // 10 minutes
      sameSite: 'lax' as const,
    }

    setCookie(c, 'oauth_state', state, cookieOptions)
    setCookie(c, 'oauth_code_verifier', codeVerifier, cookieOptions)
    setCookie(c, 'oauth_redirect', redirectTo, cookieOptions)

    let url: URL

    switch (provider) {
      case 'google':
        url = auth.google.createAuthorizationURL(state, codeVerifier, ['openid', 'email', 'profile'])
        break
      case 'github':
        url = auth.github.createAuthorizationURL(state, ['user:email', 'read:user'])
        break
      default:
        throw createBadRequestError(`Unsupported provider: ${provider}`)
    }

    auth.metrics?.attempts.add(1, { 'auth.method': provider })

    return c.redirect(url.toString())
  })

  /**
   * GET /callback/:provider
   * OAuth callback endpoint. Exchanges the authorization code for tokens,
   * creates/finds the user, generates JWT tokens, and redirects the client.
   */
  app.get('/callback/:provider', async (c) => {
    const provider = c.req.param('provider')
    const code = c.req.query('code')
    const state = c.req.query('state')

    const storedState = getCookie(c, 'oauth_state')
    const codeVerifier = getCookie(c, 'oauth_code_verifier')
    const redirectTo = getCookie(c, 'oauth_redirect') ?? '/'

    // Clean up cookies
    deleteCookie(c, 'oauth_state')
    deleteCookie(c, 'oauth_code_verifier')
    deleteCookie(c, 'oauth_redirect')

    if (!code || !state || !storedState || state !== storedState) {
      auth.metrics?.failures.add(1, { 'auth.method': provider })
      // Redirect back with error
      const origin = resolveRedirectOrigin(c.req.raw, redirectTo)
      return c.redirect(`${origin}?error=auth_failed&reason=state_mismatch`)
    }

    try {
      let profile: { provider: string, providerAccountId: string, email: string, name: string, image?: string | null }

      switch (provider) {
        case 'google': {
          if (!codeVerifier) {
            throw createBadRequestError('Missing code verifier')
          }
          const tokens = await auth.google.validateAuthorizationCode(code, codeVerifier)
          const idToken = tokens.idToken()
          // Decode Google ID token to get user info
          const claims = decodeJwtPayload(idToken)
          profile = {
            provider: 'google',
            providerAccountId: claims.sub as string,
            email: claims.email as string,
            name: (claims.name as string) ?? (claims.email as string),
            image: (claims.picture as string) ?? null,
          }
          break
        }
        case 'github': {
          const tokens = await auth.github.validateAuthorizationCode(code)
          const accessToken = tokens.accessToken()

          // Fetch GitHub user info
          const userRes = await fetch('https://api.github.com/user', {
            headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
          })
          const githubUser = await userRes.json() as { id: number, login: string, name: string | null, avatar_url: string, email: string | null }

          // If email is not public, fetch from /user/emails
          let email = githubUser.email
          if (!email) {
            const emailRes = await fetch('https://api.github.com/user/emails', {
              headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
            })
            const emails = await emailRes.json() as Array<{ email: string, primary: boolean, verified: boolean }>
            const primaryEmail = emails.find(e => e.primary && e.verified)
            email = primaryEmail?.email ?? emails[0]?.email ?? null
          }

          if (!email) {
            throw createBadRequestError('Could not retrieve email from GitHub')
          }

          profile = {
            provider: 'github',
            providerAccountId: String(githubUser.id),
            email,
            name: githubUser.name ?? githubUser.login,
            image: githubUser.avatar_url ?? null,
          }
          break
        }
        default:
          throw createBadRequestError(`Unsupported provider: ${provider}`)
      }

      const user = await auth.findOrCreateOAuthUser(profile)
      const accessToken = await auth.createAccessToken(user)
      const refreshToken = await auth.createRefreshToken(user)

      // Store refresh token as a session
      await auth.storeSession(
        user.id,
        refreshToken,
        c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip'),
        c.req.header('user-agent'),
      )

      // Redirect back to the client with tokens
      const origin = resolveRedirectOrigin(c.req.raw, redirectTo)
      const redirectUrl = new URL(redirectTo, origin)
      redirectUrl.searchParams.set('access_token', accessToken)
      redirectUrl.searchParams.set('refresh_token', refreshToken)

      return c.redirect(redirectUrl.toString())
    }
    catch (err) {
      auth.metrics?.failures.add(1, { 'auth.method': provider })
      const origin = resolveRedirectOrigin(c.req.raw, redirectTo)
      const errorMessage = err instanceof Error ? err.message : 'unknown_error'
      return c.redirect(`${origin}?error=auth_failed&reason=${encodeURIComponent(errorMessage)}`)
    }
  })

  /**
   * POST /refresh
   * Exchange a valid refresh token for a new access token.
   * Body: { refreshToken: string }
   */
  app.post('/refresh', async (c) => {
    const body = await c.req.json<{ refreshToken: string }>()
    if (!body.refreshToken) {
      throw createBadRequestError('Missing refresh token')
    }

    const payload = await auth.verifyRefreshToken(body.refreshToken)
    if (!payload) {
      throw createUnauthorizedError('Invalid or expired refresh token')
    }

    const user = await auth.getUserById(payload.sub)
    if (!user) {
      throw createUnauthorizedError('User not found')
    }

    const accessToken = await auth.createAccessToken(user)

    return c.json({ accessToken })
  })

  /**
   * POST /sign-out
   * Revoke the refresh token (invalidate the session).
   * Body: { refreshToken: string }
   */
  app.post('/sign-out', async (c) => {
    const body = await c.req.json<{ refreshToken: string }>()
    if (body.refreshToken) {
      await auth.revokeSession(body.refreshToken)
    }
    return c.json({ success: true })
  })

  /**
   * GET /session
   * Returns the current user's info based on the access token in the Authorization header.
   */
  app.get('/session', async (c) => {
    const authHeader = c.req.header('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      throw createUnauthorizedError('Missing or invalid Authorization header')
    }

    const token = authHeader.slice(7)
    const payload = await auth.verifyAccessToken(token)
    if (!payload) {
      throw createUnauthorizedError('Invalid or expired access token')
    }

    const user = await auth.getUserById(payload.sub)
    if (!user) {
      throw createUnauthorizedError('User not found')
    }

    return c.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        image: user.image,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
    })
  })

  /**
   * GET /sessions
   * List all active sessions for the current user.
   */
  app.get('/sessions', async (c) => {
    const authHeader = c.req.header('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      throw createUnauthorizedError('Missing or invalid Authorization header')
    }

    const token = authHeader.slice(7)
    const payload = await auth.verifyAccessToken(token)
    if (!payload) {
      throw createUnauthorizedError('Invalid or expired access token')
    }

    const sessions = await auth.listUserSessions(payload.sub)
    return c.json({
      sessions: sessions.map(s => ({
        id: s.id,
        createdAt: s.createdAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
      })),
    })
  })

  return app
}

const BASE64_DASH = /-/g
const BASE64_UNDERSCORE = /_/g

/**
 * Decode JWT payload without verification (for reading ID token claims).
 * The token has already been validated by the OAuth provider.
 */
function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.')
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format')
  }
  const payload = parts[1]
  const decoded = atob(payload.replace(BASE64_DASH, '+').replace(BASE64_UNDERSCORE, '/'))
  return JSON.parse(decoded)
}

/**
 * Resolve the redirect origin from the request.
 */
function resolveRedirectOrigin(request: Request, redirectTo: string): string {
  // If redirectTo is already an absolute URL, use it
  try {
    const url = new URL(redirectTo)
    if (getTrustedOrigin(url.origin)) {
      return url.origin
    }
  }
  catch {
    // Not an absolute URL, resolve from request
  }

  const referer = request.headers.get('referer')
  if (referer) {
    try {
      const origin = new URL(referer).origin
      if (getTrustedOrigin(origin)) {
        return origin
      }
    }
    catch {}
  }

  const origin = request.headers.get('origin')
  if (origin && getTrustedOrigin(origin)) {
    return origin
  }

  return ''
}
