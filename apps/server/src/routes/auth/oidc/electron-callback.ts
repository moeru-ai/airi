import type { Env } from '../../../libs/env'
import type { HonoEnv } from '../../../types/hono'

import { Hono } from 'hono'

import { buildAuthUiUrl } from '../../../utils/auth-ui'

/**
 * Redirects the Electron OIDC callback to the standalone auth UI relay page.
 *
 * Use when:
 * - The API origin remains the registered Electron redirect URI, but the relay
 *   UI bundle is deployed separately from the server image.
 *
 * Expects:
 * The loopback port is encoded in the `state` parameter as a prefix:
 * `{port}:{originalState}`. The relay page extracts the port, reconstructs
 * the original state, and forwards both `code` and `state` to the loopback.
 *
 * Returns:
 * - A redirect preserving the OIDC callback query string.
 */
export function createElectronCallbackRelay(env: Env) {
  return new Hono<HonoEnv>()
    .get('/', (c) => {
      const request = new URL(c.req.url)
      return c.redirect(buildAuthUiUrl(env.AUTH_UI_URL, '/api/auth/oidc/electron-callback', request.search))
    })
}
