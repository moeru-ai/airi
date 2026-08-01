import type { AuthEnv } from '../../libs/env'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'

import { buildAuthUiRedirectUrl, SERVER_AUTH_UI_BASE_PATH } from '../../utils/auth-ui'

export interface AuthUiRoutesDeps {
  /** Server environment carrying the standalone auth UI URL. */
  env: AuthEnv
}

/**
 * Creates routes that redirect historical server auth UI URLs to the
 * standalone auth UI deployment.
 *
 * Use when:
 * - Mounting auth pages before `/api/auth/*` catch-all routes.
 *
 * Expects:
 * - `env.AUTH_UI_URL` points to the public standalone auth UI base.
 *
 * Returns:
 * - Root-mounted redirects for `/auth/*`.
 */
export function createAuthUiRoutes(deps: AuthUiRoutesDeps) {
  return new Hono<HonoEnv>()
    .get(SERVER_AUTH_UI_BASE_PATH, c => c.redirect(buildAuthUiRedirectUrl(deps.env.AUTH_UI_URL, c.req.url, deps.env.PUBLIC_URL)))
    .get(`${SERVER_AUTH_UI_BASE_PATH}/*`, c => c.redirect(buildAuthUiRedirectUrl(deps.env.AUTH_UI_URL, c.req.url, deps.env.PUBLIC_URL)))
}
