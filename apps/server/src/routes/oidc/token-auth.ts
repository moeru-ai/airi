import type { AuthInstance } from '../../libs/auth'
import type { Env } from '../../libs/env'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'

import { resolveRequestAuth } from '../../libs/request-auth'

export interface OIDCTokenAuthRouteDeps {
  auth: AuthInstance
  env: Env
}

export function createOIDCTokenAuthRoute(deps: OIDCTokenAuthRouteDeps) {
  return new Hono<HonoEnv>()
    .on(['GET', 'POST'], '/get-session', async (c) => {
      const session = await resolveRequestAuth(deps.auth, deps.env, c.req.raw.headers)
      return c.json(session)
    })
    .post('/sign-out', async (c) => {
      // NOTICE: JWT access tokens are self-contained and expire naturally.
      // Refresh token revocation is handled by oauthProvider's /oauth2/token endpoint.
      // This endpoint exists for client compatibility — it acknowledges the signout intent.
      return c.json({ success: true })
    })
    .get('/list-sessions', async (c) => {
      const session = await resolveRequestAuth(deps.auth, deps.env, c.req.raw.headers)
      return c.json(session ? [session.session] : [])
    })
}
