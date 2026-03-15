import type { AppType } from '../../../../apps/server/src/app'

import { hc } from 'hono/client'

import { SERVER_URL } from '../libs/auth'

export const client = hc<AppType>(SERVER_URL, {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    return fetch(input, {
      ...init,
      headers,
      credentials: 'include', // Send cookies with request (for sessions, etc)
    })
  },
})
