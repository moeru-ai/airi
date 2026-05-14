import type { AuthInstance } from '../../libs/auth'
import type { Env } from '../../libs/env'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'

import { buildGravatarUrl } from '../../libs/gravatar'
import { resolveRequestAuth } from '../../libs/request-auth'

export interface OIDCTokenAuthRouteDeps {
  auth: AuthInstance
  env: Env
}

export function createOIDCTokenAuthRoute(deps: OIDCTokenAuthRouteDeps) {
  return new Hono<HonoEnv>()
    .on(['GET', 'POST'], '/get-session', async (c) => {
      const session = await resolveRequestAuth(deps.auth, deps.env, c.req.raw.headers)
      if (!session)
        return c.json(null)

      // NOTICE:
      // Avatar fallback to Gravatar happens here so every client (web,
      // Electron, mobile, future SSR) renders the same picture without
      // re-implementing SHA-256 hashing or Gravatar URL conventions. The
      // DB only stores user-set / provider-set images; the fallback is
      // computed at response time so a future swap (DiceBear, self-hosted
      // proxy) is a one-line change here.
      //
      // We intentionally do NOT carry an `imageSource` flag — the URL
      // itself is the signal: anything starting with
      // `https://www.gravatar.com/avatar/` is the fallback, anything else
      // is manual / provider-set. Skipping the flag keeps the API surface
      // small and the server free of redundant state. If we ever change
      // the fallback provider, both this file and the client-side prefix
      // check must be updated together.
      // Removal condition: avatar storage moves off-band (e.g. CDN) and
      // `user.image` becomes the canonical URL for every user.
      const image = session.user.image || buildGravatarUrl(session.user.email)

      return c.json({ ...session, user: { ...session.user, image } })
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
