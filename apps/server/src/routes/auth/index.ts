import type { AuthInstance } from '../../libs/auth'
import type { Database } from '../../libs/db'
import type { Env } from '../../libs/env'
import type { RateLimitMetrics } from '../../otel'
import type { ConfigKVService } from '../../services/adapters/config-kv'
import type { HonoEnv } from '../../types/hono'

import { oauthProviderAuthServerMetadata, oauthProviderOpenIdConfigMetadata } from '@better-auth/oauth-provider'
import { Hono } from 'hono'

import { ensureDynamicFirstPartyRedirectUri } from '../../libs/auth'
import { isUserBannedNow, resolveSessionIgnoringBan } from '../../libs/request-auth'
import { rateLimiter } from '../../middlewares/rate-limit'
import { createForbiddenError } from '../../utils/error'
import { checkEmailIdentifier } from './email-identifier'
import { createElectronCallbackRelay } from './oidc/electron-callback'
import { createOIDCTokenAuthRoute } from './oidc/token-auth'
import { createAuthUiRoutes } from './ui-routes'

export interface AuthRoutesDeps {
  auth: AuthInstance
  db: Database
  env: Env
  configKV: ConfigKVService
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
  async function handleAuthRequest(request: Request): Promise<Response> {
    const response = await deps.auth.handler(request)

    if (!(response instanceof Response))
      throw new TypeError('Expected auth handler to return a Response')

    return response
  }

  return new Hono<HonoEnv>()
    .route('/', createAuthUiRoutes({ env: deps.env }))
    /**
     * Auth routes are handled by the auth instance directly,
     * Powered by better-auth.
     * Rate limited by IP: 20 requests per minute.
     */
    .use('/api/auth/*', rateLimiter({
      max: await deps.configKV.getOrThrow('AUTH_RATE_LIMIT_MAX'),
      windowSec: await deps.configKV.getOrThrow('AUTH_RATE_LIMIT_WINDOW_SEC'),
      keyGenerator: c => c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'unknown',
      metrics: deps.rateLimitMetrics,
      routeLabel: 'auth.api',
    }))
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
      const resolved = await resolveSessionIgnoringBan(deps.auth, deps.env, c.req.raw.headers)
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
      return oauthProviderAuthServerMetadata(deps.auth)(c.req.raw)
    })
    /**
     * OpenID Connect discovery metadata uses path appending for issuers with
     * paths, so `/api/auth` serves its own `/.well-known/openid-configuration`.
     */
    .on('GET', '/api/auth/.well-known/openid-configuration', async (c) => {
      return oauthProviderOpenIdConfigMetadata(deps.auth)(c.req.raw)
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
      return c.json(await checkEmailIdentifier({ db: deps.db }, body))
    })
    .on(['POST', 'GET'], '/api/auth/*', async (c) => {
      return handleAuthRequest(c.req.raw)
    })
}
