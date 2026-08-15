import type { AuthSession } from '@proj-airi/auth-shared'

import type { AuthInstance } from './auth'
import type { AuthDatabase } from './db'
import type { AuthEnv } from './env'
import type { RateLimitMetrics } from './otel'
import type { AuthConfigService } from './rate-limit'

import { createHash } from 'node:crypto'

import { account, isUserBannedNow, user } from '@proj-airi/auth-shared'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { email, nonEmpty, object, pipe, safeParse, string, transform } from 'valibot'

import { ensureDynamicFirstPartyRedirectUri } from './auth'
import { createBadRequestError, createForbiddenError } from './error'
import { rateLimiter } from './rate-limit'

export interface HonoEnv {
  Variables: {
    user: AuthSession['user'] | null
    session: AuthSession['session'] | null
  }
}

export const SERVER_AUTH_UI_BASE_PATH = '/auth'
export const AUTH_UI_PUBLIC_URL_QUERY_PARAM = 'api_server_url'
export const DEFAULT_AUTH_UI_URL = 'https://accounts.airi.build/ui'
export const SERVER_DEV_PUBLIC_URL = 'https://airi-server-dev.up.railway.app'
export const SERVER_DEV_AUTH_UI_URL = 'https://server-dev.airi-server-auth.pages.dev/ui'

const FORWARDED_AUTH_UI_PROVIDERS = new Set(['google', 'github', 'steam'])

/** Builds a route URL below the configured standalone Auth UI base. */
export function buildAuthUiUrl(authUiUrl: string, path: string, search = ''): string {
  const target = new URL(authUiUrl)
  const basePath = target.pathname.replace(/\/+$/, '')
  const routePath = path.startsWith('/') ? path : `/${path}`
  target.pathname = `${basePath}${routePath}`
  target.search = search
  target.hash = ''
  return target.toString()
}

/** Resolves environment-specific Auth UI hosting without changing other URLs. */
export function resolveAuthUiUrl(authUiUrl: string, apiServerUrl: string): string {
  try {
    const authUi = new URL(authUiUrl)
    const defaultAuthUi = new URL(DEFAULT_AUTH_UI_URL)
    const apiServer = new URL(apiServerUrl)
    const authUiBase = `${authUi.origin}${authUi.pathname.replace(/\/+$/, '')}`
    const defaultAuthUiBase = `${defaultAuthUi.origin}${defaultAuthUi.pathname.replace(/\/+$/, '')}`
    if (authUiBase === defaultAuthUiBase && apiServer.origin === SERVER_DEV_PUBLIC_URL)
      return SERVER_DEV_AUTH_UI_URL
  }
  catch {
    return authUiUrl
  }
  return authUiUrl
}

/** Maps a public `/auth/*` request to its standalone Auth UI URL. */
export function buildAuthUiRedirectUrl(authUiUrl: string, requestUrl: string, apiServerUrl?: string): string {
  const request = new URL(requestUrl)
  const suffix = request.pathname === SERVER_AUTH_UI_BASE_PATH
    ? '/'
    : request.pathname.slice(SERVER_AUTH_UI_BASE_PATH.length) || '/'
  const resolvedAuthUiUrl = apiServerUrl ? resolveAuthUiUrl(authUiUrl, apiServerUrl) : authUiUrl
  const target = new URL(buildAuthUiUrl(resolvedAuthUiUrl, suffix, request.search))
  if (apiServerUrl)
    target.searchParams.set(AUTH_UI_PUBLIC_URL_QUERY_PARAM, new URL(apiServerUrl).origin)
  return target.toString()
}

/** Restores a trusted mobile provider hint after the OIDC plugin builds its sign-in redirect. */
function forwardAuthUiProviderHint(requestUrl: string, response: Response): Response {
  const request = new URL(requestUrl)
  const provider = request.searchParams.get('provider')
  const location = response.headers.get('location')

  if (response.status < 300 || response.status >= 400 || !provider || !FORWARDED_AUTH_UI_PROVIDERS.has(provider) || !location)
    return response

  const target = new URL(location, request)
  if (target.origin !== request.origin || target.pathname !== `${SERVER_AUTH_UI_BASE_PATH}/sign-in`)
    return response

  target.searchParams.set('provider', provider)

  const headers = new Headers(response.headers)
  headers.set('location', location.startsWith('/') ? `${target.pathname}${target.search}${target.hash}` : target.toString())
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

const remoteJwksByUrl = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

function readBearerToken(headers: Headers): string | null {
  const authorization = headers.get('authorization')
  if (!authorization?.startsWith('Bearer '))
    return null

  const token = authorization.slice(7).trim()
  return token.length > 0 ? token : null
}

function getRemoteJwks(publicUrl: string): ReturnType<typeof createRemoteJWKSet> {
  const jwksUrl = new URL('/api/auth/jwks', publicUrl).toString()
  const cached = remoteJwksByUrl.get(jwksUrl)
  if (cached)
    return cached

  const jwks = createRemoteJWKSet(new URL(jwksUrl))
  remoteJwksByUrl.set(jwksUrl, jwks)
  return jwks
}

async function resolveJwtAccessToken(
  db: AuthDatabase,
  env: Pick<AuthEnv, 'PUBLIC_URL'>,
  accessToken: string,
): Promise<AuthSession | null> {
  try {
    const { payload } = await jwtVerify(accessToken, getRemoteJwks(env.PUBLIC_URL), {
      issuer: `${env.PUBLIC_URL}/api/auth`,
      audience: env.PUBLIC_URL,
    })
    if (!payload.sub)
      return null

    const resolvedUser = await db.query.user.findFirst({
      where: eq(user.id, payload.sub),
    })
    if (!resolvedUser)
      return null

    const issuedAt = payload.iat ? new Date(payload.iat * 1000) : new Date()
    return {
      user: resolvedUser,
      session: {
        id: payload.jti ?? payload.sub,
        token: accessToken,
        userId: payload.sub,
        createdAt: issuedAt,
        updatedAt: issuedAt,
        expiresAt: payload.exp ? new Date(payload.exp * 1000) : new Date(),
        ipAddress: null,
        userAgent: null,
      },
    }
  }
  catch {
    return null
  }
}

async function resolveSessionIgnoringBan(
  auth: AuthInstance,
  db: AuthDatabase,
  env: Pick<AuthEnv, 'PUBLIC_URL'>,
  headers: Headers,
): Promise<AuthSession | null> {
  const session = await auth.api.getSession({ headers })
  if (session?.user && session?.session)
    return session

  const accessToken = readBearerToken(headers)
  if (!accessToken)
    return null

  return await resolveJwtAccessToken(db, env, accessToken)
}

async function resolveAuthRequest(
  auth: AuthInstance,
  db: AuthDatabase,
  env: Pick<AuthEnv, 'PUBLIC_URL'>,
  headers: Headers,
): Promise<AuthSession | null> {
  const resolved = await resolveSessionIgnoringBan(auth, db, env, headers)
  if (!resolved || isUserBannedNow(resolved.user))
    return null

  return resolved
}

function buildGravatarUrl(emailAddress: string): string | null {
  const normalized = emailAddress.trim().toLowerCase()
  if (!normalized)
    return null

  const url = new URL(createHash('sha256').update(normalized).digest('hex'), 'https://www.gravatar.com/avatar/')
  url.searchParams.set('d', 'identicon')
  url.searchParams.set('s', '200')
  return url.toString()
}

const CheckEmailIdentifierBodySchema = object({
  email: pipe(
    string(),
    transform(value => value.trim().toLowerCase()),
    nonEmpty('email is required'),
    email('email must be a valid email address'),
  ),
})

async function checkEmailIdentifier(db: AuthDatabase, body: { email?: unknown } | null) {
  const parsed = safeParse(CheckEmailIdentifierBodySchema, body)
  if (!parsed.success)
    throw createBadRequestError('Invalid email', 'INVALID_EMAIL')

  const [matched] = await db.select({ id: user.id }).from(user).where(eq(user.email, parsed.output.email)).limit(1)
  if (!matched)
    return { exists: false, hasPassword: false }

  const [credential] = await db
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, matched.id), eq(account.providerId, 'credential')))
    .limit(1)
  return { exists: true, hasPassword: !!credential }
}

function createAuthUiRoutes(env: AuthEnv) {
  return new Hono<HonoEnv>()
    .get(SERVER_AUTH_UI_BASE_PATH, c => c.redirect(buildAuthUiRedirectUrl(env.AUTH_UI_URL, c.req.url, env.PUBLIC_URL)))
    .get(`${SERVER_AUTH_UI_BASE_PATH}/*`, c => c.redirect(buildAuthUiRedirectUrl(env.AUTH_UI_URL, c.req.url, env.PUBLIC_URL)))
}

function createElectronCallbackRelay(env: AuthEnv) {
  return new Hono<HonoEnv>().get('/', (c) => {
    const request = new URL(c.req.url)
    return c.redirect(buildAuthUiUrl(env.AUTH_UI_URL, '/api/auth/oidc/electron-callback', request.search))
  })
}

function createOIDCTokenAuthRoute(deps: Pick<AuthRoutesDeps, 'auth' | 'db' | 'env'>) {
  return new Hono<HonoEnv>()
    .on(['GET', 'POST'], '/get-session', async (c) => {
      const session = await resolveAuthRequest(deps.auth, deps.db, deps.env, c.req.raw.headers)
      if (!session)
        return c.json(null)
      const image = session.user.image || buildGravatarUrl(session.user.email)
      return c.json({ ...session, user: { ...session.user, image } })
    })
    .post('/sign-out', c => c.json({ success: true }))
    .get('/list-sessions', async (c) => {
      const session = await resolveAuthRequest(deps.auth, deps.db, deps.env, c.req.raw.headers)
      return c.json(session ? [session.session] : [])
    })
}

export interface AuthRoutesDeps {
  auth: AuthInstance
  db: AuthDatabase
  env: AuthEnv
  authConfig: AuthConfigService
  rateLimitMetrics?: RateLimitMetrics | null
}

/**
 * All auth-related routes: sign-in page, rate-limited better-auth
 * helper routes, electron callback relay, catch-all, and
 * well-known metadata endpoints.
 *
 * Mounted at the root level because routes span multiple prefixes
 * (`/auth/*`, `/api/auth/*`, `/.well-known/*`).
 */
export async function createAuthRoutes(deps: AuthRoutesDeps) {
  const rateLimitConfig = await deps.authConfig.getRateLimit()

  async function handleAuthRequest(request: Request): Promise<Response> {
    const response = await deps.auth.handler(request)

    if (!(response instanceof Response))
      throw new TypeError('Expected auth handler to return a Response')

    return forwardAuthUiProviderHint(request.url, response)
  }

  return new Hono<HonoEnv>()
    .route('/', createAuthUiRoutes(deps.env))
    /**
     * Auth routes are handled by the auth instance directly,
     * Powered by better-auth.
     * Rate limited by the Auth-owned runtime configuration.
     */
    .use('/api/auth/*', rateLimiter({
      max: rateLimitConfig.max,
      windowSec: rateLimitConfig.windowSec,
      // Proxy trust is a deployment boundary, not a property of the public
      // API URL. Custom domains and private gateways must opt in explicitly.
      trustedProxy: deps.env.RATE_LIMIT_TRUSTED_PROXY,
      metrics: deps.rateLimitMetrics,
      routeLabel: 'auth.api',
    }))
    .all('/api/auth/admin', c => c.notFound())
    .all('/api/auth/admin/*', c => c.notFound())
    .use('/api/auth/oauth2/authorize', async (c, next) => {
      await ensureDynamicFirstPartyRedirectUri(deps.db, c.req.raw, deps.env.ADDITIONAL_TRUSTED_ORIGINS)
      await next()
    })
    // NOTICE:
    // `/api/auth/*` bypasses sessionMiddleware (and thus the ban gate in
    // resolveRequestAuth), and oauthProvider's /oauth2/userinfo validates the
    // bearer JWT by signature only — so a banned user's still-valid access
    // token (<=1h TTL) could otherwise read its own profile claims after a ban.
    // This guard re-applies the ban check on that one endpoint. We resolve the
    // subject ignoring the ban, then 403 if banned, so an invalid/expired token
    // still falls through to better-auth's own 401 rather than being masked.
    // (/oauth2/introspect needs confidential client credentials, which no
    // first-party AIRI client has, so it has no reachable banned-caller path.)
    .use('/api/auth/oauth2/userinfo', async (c, next) => {
      const resolved = await resolveSessionIgnoringBan(deps.auth, deps.db, deps.env, c.req.raw.headers)
      if (resolved && isUserBannedNow(resolved.user))
        throw createForbiddenError('This account has been banned')
      await next()
    })
    .route('/api/auth', createOIDCTokenAuthRoute(deps))
    /**
     * Electron OIDC callback relay: serves an HTML page that forwards the
     * authorization code to the Electron loopback server via JS fetch().
     * This avoids navigating the browser to http://127.0.0.1:{port}.
     */
    .route('/api/auth/oidc/electron-callback', createElectronCallbackRelay(deps.env))
    /**
     * OAuth 2.1 Authorization Server metadata must live at the root-level
     * well-known path with the issuer path inserted for non-root issuers.
     */
    .on('GET', '/.well-known/oauth-authorization-server/api/auth', async (c) => {
      return c.json(await deps.auth.api.getOAuthServerConfig(), 200, {
        'Cache-Control': 'public, max-age=15, stale-while-revalidate=15, stale-if-error=86400',
      })
    })
    /**
     * OpenID Connect discovery metadata uses path appending for issuers with
     * paths, so `/api/auth` serves its own `/.well-known/openid-configuration`.
     */
    .on('GET', '/api/auth/.well-known/openid-configuration', async (c) => {
      return c.json(await deps.auth.api.getOpenIdConfig(), 200, {
        'Cache-Control': 'public, max-age=15, stale-while-revalidate=15, stale-if-error=86400',
      })
    })
    /**
     * Email-first identifier check.
     *
     * Powers the unified sign-in/up UI: the user types an email, the UI calls
     * this to decide whether to render a password input (existing user with
     * a credential account) or the new-account form (or steer them to a
     * social provider when only social accounts exist).
     *
     * Returns:
     * - `exists`: a `user` row matches the email (case-insensitive).
     * - `hasPassword`: that user has an account row with `providerId='credential'`,
     *   i.e. can sign in via email + password (vs. social-only).
     *
     * Account-enumeration tradeoff: this confirms whether an email is
     * registered, mirroring the standard set by Google/Linear/Notion. We
     * accept the disclosure since the existing rate limiter applied to
     * `/api/auth/*` (`AUTH_RATE_LIMIT_MAX` per IP per window) already throttles
     * enumeration attempts.
     */
    .on('POST', '/api/auth/check-email', async (c) => {
      const body = await c.req.json().catch(() => null) as { email?: unknown } | null
      return c.json(await checkEmailIdentifier(deps.db, body))
    })
    .on(['POST', 'GET'], '/api/auth/*', async (c) => {
      return handleAuthRequest(c.req.raw)
    })
}
