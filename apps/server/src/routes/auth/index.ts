import type { AuthInstance } from '../../libs/auth'
import type { Database } from '../../libs/db'
import type { Env } from '../../libs/env'
import type { RateLimitMetrics } from '../../libs/otel'
import type { ConfigKVService } from '../../services/config-kv'
import type { HonoEnv } from '../../types/hono'

import { oauthProviderAuthServerMetadata, oauthProviderOpenIdConfigMetadata } from '@better-auth/oauth-provider'
import { serveStatic } from '@hono/node-server/serve-static'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'

import { ensureDynamicFirstPartyRedirectUri } from '../../libs/auth'
import { rateLimiter } from '../../middlewares/rate-limit'
import { account, user } from '../../schemas/accounts'
import { createBadRequestError } from '../../utils/error'
import { getServerAuthUiDistDir, renderServerAuthUiHtml, SERVER_AUTH_UI_BASE_PATH } from '../../utils/server-auth-ui'
import { createElectronCallbackRelay } from '../oidc/electron-callback'
import { createOIDCTokenAuthRoute } from '../oidc/token-auth'

// NOTICE:
// Loose RFC-5322-ish regex used to fail fast on obviously malformed input.
// Authoritative validation happens in better-auth on sign-in/sign-up;
// this is just a pre-flight gate for the email-first identifier step so we
// avoid hitting the DB with garbage.
const EMAIL_SHAPE_RE = /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/

const RE_SERVER_AUTH_UI_BASE_PATH = /^\/auth/

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
    .use(`${SERVER_AUTH_UI_BASE_PATH}/*`, serveStatic({
      root: getServerAuthUiDistDir(),
      rewriteRequestPath: (path: string) => path.replace(RE_SERVER_AUTH_UI_BASE_PATH, ''),
    }))
    /**
     * Login page for the OIDC Provider flow, served under the ui-server-auth
     * vue-router base (`/auth/sign-in`). When an unauthenticated
     * user hits `/api/auth/oauth2/authorize`, better-auth redirects here
     * because of `oauthProvider({ loginPage })`. After the user signs in via
     * a social provider, the social callback redirects to `callbackURL`,
     * which points back to the OIDC authorize endpoint.
     *
     * If a `provider` query parameter is present (e.g. `?provider=github`),
     * skip the picker page and redirect directly to the social provider.
     *
     * Registered BEFORE the SPA `/auth/*` wildcard fallback so
     * the provider shortcut gets a chance to short-circuit. Hono matches
     * routes in registration order — specific path before wildcard wins.
     */
    .on('GET', `${SERVER_AUTH_UI_BASE_PATH}/sign-in`, (c) => {
      const provider = c.req.query('provider')

      // Reconstruct the OIDC authorize URL from query params so the flow
      // resumes after social login. The oauthProvider plugin appends all
      // authorization request params when redirecting to loginPage.
      const url = new URL(c.req.url)
      const oidcParams = new URLSearchParams(url.searchParams)
      oidcParams.delete('provider')
      // Strip prompt so the post-sign-in redirect to authorize doesn't force
      // another sign-in — prompt=login should only apply on the first pass.
      oidcParams.delete('prompt')

      const callbackURL = oidcParams.toString()
        ? `${deps.env.API_SERVER_URL}/api/auth/oauth2/authorize?${oidcParams.toString()}`
        : '/'

      if (!!provider && ['google', 'github'].includes(provider)) {
        const socialUrl = `${deps.env.API_SERVER_URL}/api/auth/sign-in/social?provider=${provider}&callbackURL=${encodeURIComponent(callbackURL)}`
        return c.redirect(socialUrl)
      }

      return c.html(renderServerAuthUiHtml({
        apiServerUrl: deps.env.API_SERVER_URL,
        currentUrl: c.req.url,
      }))
    })
    /**
     * SPA fallback for the ui-server-auth bundle.
     *
     * vue-router runs with `createWebHistory('/auth/')`, so any
     * client-side route — `/auth/verify-email`,
     * `/auth/forgot-password`, `/auth/reset-password`,
     * etc. — appears in the URL bar but has no matching file in the dist.
     * Without this handler, deep-link hits (verification email links, page
     * refresh on a SPA route, copy-pasted URLs) fall through `serveStatic`
     * to the global 404 JSON.
     *
     * Mounted AFTER the static middleware so real assets under
     * `/auth/assets/...` still resolve to the file on disk;
     * `serveStatic` short-circuits on hits and only calls through on misses.
     */
    .on('GET', `${SERVER_AUTH_UI_BASE_PATH}/*`, (c) => {
      return c.html(renderServerAuthUiHtml({
        apiServerUrl: deps.env.API_SERVER_URL,
        currentUrl: c.req.url,
      }))
    })

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
      await ensureDynamicFirstPartyRedirectUri(deps.db, c.req.raw)
      await next()
    })
    .route('/api/auth', createOIDCTokenAuthRoute(deps))
    /**
     * Electron OIDC callback relay: serves an HTML page that forwards the
     * authorization code to the Electron loopback server via JS fetch().
     * This avoids navigating the browser to http://127.0.0.1:{port}.
     */
    .route('/api/auth/oidc/electron-callback', createElectronCallbackRelay())
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
      const raw = typeof body?.email === 'string' ? body.email.trim() : ''
      const email = raw.toLowerCase()

      if (!email || !EMAIL_SHAPE_RE.test(email))
        throw createBadRequestError('Invalid email', 'INVALID_EMAIL')

      const [matched] = await deps.db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, email))
        .limit(1)

      if (!matched)
        return c.json({ exists: false, hasPassword: false })

      const [credential] = await deps.db
        .select({ id: account.id })
        .from(account)
        .where(and(
          eq(account.userId, matched.id),
          eq(account.providerId, 'credential'),
        ))
        .limit(1)

      return c.json({ exists: true, hasPassword: !!credential })
    })
    .on(['POST', 'GET'], '/api/auth/*', async (c) => {
      return handleAuthRequest(c.req.raw)
    })
}
