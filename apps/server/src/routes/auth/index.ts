import type { AuthInstance } from '../../libs/auth'
import type { Database } from '../../libs/db'
import type { Env } from '../../libs/env'
import type { ConfigKVService } from '../../services/config-kv'
import type { HonoEnv } from '../../types/hono'

import { oauthProviderAuthServerMetadata, oauthProviderOpenIdConfigMetadata } from '@better-auth/oauth-provider'
import { Hono } from 'hono'

import { ensureDynamicFirstPartyRedirectUri } from '../../libs/auth'
import { rateLimiter } from '../../middlewares/rate-limit'
import { renderSignInPage } from '../../utils/sign-in-page'
import { createElectronCallbackRelay } from '../oidc/electron-callback'
import { createOIDCTokenAuthRoute } from '../oidc/token-auth'

export interface AuthRoutesDeps {
  auth: AuthInstance
  db: Database
  env: Env
  configKV: ConfigKVService
}

/**
 * All auth-related routes: sign-in page, rate-limited better-auth
 * helper routes, electron callback relay, catch-all, and
 * well-known metadata endpoints.
 *
 * Mounted at the root level because routes span multiple prefixes
 * (`/sign-in`, `/api/auth/*`, `/.well-known/*`).
 */
export async function createAuthRoutes(deps: AuthRoutesDeps) {
  async function handleAuthRequest(request: Request): Promise<Response> {
    const response = await deps.auth.handler(request)

    if (!(response instanceof Response))
      throw new TypeError('Expected auth handler to return a Response')

    return response
  }

  return new Hono<HonoEnv>()
    /**
     * Minimal login page for the OIDC Provider flow.
     * When an unauthenticated user hits /api/auth/oauth2/authorize,
     * better-auth redirects here. After the user signs in via a social
     * provider, the social callback redirects to callbackURL which
     * points back to the OIDC authorize endpoint.
     *
     * If a `provider` query parameter is present (e.g. `?provider=github`),
     * skip the picker page and redirect directly to the social provider.
     */
    .on('GET', '/sign-in', (c) => {
      const provider = c.req.query('provider')

      // Reconstruct the OIDC authorize URL from query params so the flow
      // resumes after social login. The oauthProvider plugin appends all
      // authorization request params when redirecting to loginPage.
      const url = new URL(c.req.url)
      const oidcParams = new URLSearchParams(url.searchParams)
      oidcParams.delete('provider')
      // Strip prompt so the post-login redirect to authorize doesn't force
      // another login — prompt=login should only apply on the first pass.
      oidcParams.delete('prompt')

      const callbackURL = oidcParams.toString()
        ? `${deps.env.API_SERVER_URL}/api/auth/oauth2/authorize?${oidcParams.toString()}`
        : '/'

      if (provider === 'google' || provider === 'github') {
        const socialUrl = `${deps.env.API_SERVER_URL}/api/auth/sign-in/social?provider=${provider}&callbackURL=${encodeURIComponent(callbackURL)}`
        return c.redirect(socialUrl)
      }

      // Fallback: show the sign-in picker page (e.g. direct browser visit)
      return c.html(renderSignInPage(deps.env.API_SERVER_URL, callbackURL))
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
    .on(['POST', 'GET'], '/api/auth/*', async (c) => {
      return handleAuthRequest(c.req.raw)
    })
}
