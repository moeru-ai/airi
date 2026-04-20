import type { AppType } from '../../../../apps/server/src/app'

import { hc } from 'hono/client'

import { authedFetch } from '../libs/auth-fetch'
import { getBrowserApiOrigin } from '../libs/server'

export const client = hc<AppType>(getBrowserApiOrigin(), {
  fetch: authedFetch,
})

export type StageApiClient = typeof client
