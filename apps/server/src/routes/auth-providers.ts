import type { Env } from '../libs/env'
import type { HonoEnv } from '../types/hono'

import { Hono } from 'hono'

export function createAuthProvidersRoute(env: Env) {
  const providers = [
    {
      id: 'google' as const,
      available: !!(env.AUTH_GOOGLE_CLIENT_ID && env.AUTH_GOOGLE_CLIENT_SECRET),
    },
    {
      id: 'github' as const,
      available: !!(env.AUTH_GITHUB_CLIENT_ID && env.AUTH_GITHUB_CLIENT_SECRET),
    },
  ]

  return new Hono<HonoEnv>()
    .get('/', c => c.json(providers))
}
