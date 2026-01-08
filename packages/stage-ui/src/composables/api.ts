import type { AppType } from '../../../../apps/server/src/app'

import { hc } from 'hono/client'

import { SERVER_URL } from '../libs/auth'
import { useAuthStore } from '../stores/auth'

export const client = hc<AppType>(SERVER_URL, {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => {
    const authStore = useAuthStore()
    const headers = new Headers(init?.headers)
    if (authStore.authToken) {
      headers.set('Authorization', `Bearer ${authStore.authToken}`)
    }
    return fetch(input, {
      ...init,
      headers,
      credentials: 'include', // Send cookies with request (for sessions, etc)
    })
  },
})
