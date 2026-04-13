import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'

import { renderServerAuthUiHtml } from '../../utils/server-auth-ui'

/**
 * Render an HTML relay page that forwards the OIDC authorization code
 * to the Electron app's loopback server.
 *
 * The page first tries a background fetch() for the cleanest UX. If the browser
 * blocks cross-origin loopback fetches, it falls back to a top-level navigation
 * and also exposes a manual localhost link so the user can complete the flow.
 *
 * The loopback port is encoded in the `state` parameter as a prefix:
 * `{port}:{originalState}`. The relay page extracts the port, reconstructs
 * the original state, and forwards both `code` and `state` to the loopback.
 */
export function createElectronCallbackRelay() {
  return new Hono<HonoEnv>()
    .get('/', (c) => {
      const code = c.req.query('code') ?? ''
      const state = c.req.query('state') ?? ''
      const error = c.req.query('error') ?? ''
      const errorDescription = c.req.query('error_description') ?? ''

      return c.html(renderServerAuthUiHtml({
        apiServerUrl: new URL(c.req.url).origin,
        currentUrl: c.req.url,
        oidcCallback: {
          code,
          error,
          errorDescription,
          state,
        },
      }))
    })
}
