import type { AppType } from '../../../../apps/server/src/app'

import { hc } from 'hono/client'

import { getAccessToken } from '../libs/auth'
import { SERVER_URL } from '../libs/server'

export const client = hc<AppType>(SERVER_URL, {
  fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers)

    // Inject JWT access token into Authorization header
    const accessToken = await getAccessToken()
    if (accessToken) {
      headers.set('Authorization', `Bearer ${accessToken}`)
    }

    return fetch(input, {
      ...init,
      headers,
    })
  },
})
