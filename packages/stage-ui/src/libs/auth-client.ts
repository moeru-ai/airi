import { createAuthClient } from 'better-auth/vue'

import { SERVER_URL } from './server'
import { steamClient } from './steam-auth-client'

function getPersistedAuthToken(): null | string {
  return localStorage.getItem('auth/v1/token')
}

export const authClient = createAuthClient({
  baseURL: SERVER_URL,
  fetchOptions: {
    auth: {
      token: () => getPersistedAuthToken() ?? '',
      type: 'Bearer',
    },
    // NOTICE: better-auth sets `credentials: "include"` by default.
    // AIRI uses Bearer authentication and must not attach a browser session cookie.
    credentials: 'omit',
  },
  plugins: [steamClient()],
})

/**
 * Gets the session with the specified access token.
 *
 * The explicit token keeps the request independent from asynchronous storage writes.
 */
export async function requestAuthSession(accessToken: null | string) {
  if (!accessToken)
    return null

  const { data } = await authClient.getSession({
    fetchOptions: {
      auth: {
        token: accessToken,
        type: 'Bearer',
      },
    },
  })
  return data
}
