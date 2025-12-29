import type { AppType } from '../../../server/src/app'

import { hc } from 'hono/client'

import { useAuthStore } from '../stores/auth'
import { API_SERVER_URL } from './auth'

export const client = hc<AppType>(API_SERVER_URL, {
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
