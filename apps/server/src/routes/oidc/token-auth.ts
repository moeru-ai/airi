import type { Database } from '../../libs/db'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'

import { resolveRequestAuth, revokeOIDCAccessToken } from '../../libs/request-auth'

export interface OIDCTokenAuthRouteDeps {
  auth: any
  db: Database
}

export function createOIDCTokenAuthRoute(deps: OIDCTokenAuthRouteDeps) {
  return new Hono<HonoEnv>()
    .on(['GET', 'POST'], '/get-session', async (c) => {
      const session = await resolveRequestAuth(deps.auth, deps.db, c.req.raw.headers)
      return c.json(session)
    })
    .post('/sign-out', async (c) => {
      const authorization = c.req.header('authorization')
      const accessToken = authorization?.startsWith('Bearer ')
        ? authorization.slice(7).trim()
        : null

      if (accessToken) {
        await revokeOIDCAccessToken(deps.db, accessToken)
      }

      return c.json({ success: true })
    })
    .get('/list-sessions', async (c) => {
      const session = await resolveRequestAuth(deps.auth, deps.db, c.req.raw.headers)
      return c.json(session ? [session.session] : [])
    })
}
