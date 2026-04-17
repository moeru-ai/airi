import type { AppType } from '../../../../apps/server/src/app'

import { hc } from 'hono/client'

import { authedFetch } from '../libs/auth-fetch'
import { SERVER_URL } from '../libs/server'

export const client = hc<AppType>(SERVER_URL, {
  fetch: authedFetch,
})
