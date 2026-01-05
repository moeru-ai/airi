import type { AppType } from '../../../../apps/server/src/app'

import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { hc } from 'hono/client'

import { SERVER_URL } from '../libs/auth'

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
