import type { Env } from '../../libs/env'
import type { HonoEnv } from '../../types/hono'

import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'

import { getServerAuthUiDistDir, renderServerAuthUiHtml, SERVER_AUTH_UI_BASE_PATH } from '../../utils/server-auth-ui'

const RE_SERVER_AUTH_UI_BASE_PATH = /^\/auth/

export interface AuthUiRoutesDeps {
  /** Server environment used to build OIDC callback URLs and UI config. */
  env: Env
}

/**
 * Creates routes for the server-hosted auth UI bundle.
 *
 * Use when:
 * - Mounting auth pages before `/api/auth/*` catch-all routes.
 *
 * Expects:
 * - The ui-server-auth dist exists under `getServerAuthUiDistDir()`.
 *
 * Returns:
 * - Root-mounted Hono routes for `/auth/*`.
 */
export function createAuthUiRoutes(deps: AuthUiRoutesDeps) {
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
}
