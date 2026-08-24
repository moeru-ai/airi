import { createAuthClient } from 'better-auth/vue'

import { SERVER_URL } from './server'
import { steamClient } from './steam-auth-client'

function getPersistedAuthToken(): string | null {
  return localStorage.getItem('auth/v1/token')
}

export const authClient = createAuthClient({
  baseURL: SERVER_URL,
  plugins: [steamClient()],
  fetchOptions: {
    // NOTICE: better-auth sets `credentials: "include"` by default.
    // AIRI uses Bearer authentication and must not attach a browser session cookie.
    credentials: 'omit',
    auth: {
      type: 'Bearer',
      token: () => getPersistedAuthToken() ?? '',
    },
  },
})

/**
 * Gets the session with the specified access token.
 *
 * The explicit token keeps the request independent from asynchronous storage writes.
 */
export async function requestAuthSession(accessToken: string | null) {
  if (!accessToken)
    return null

  const { data } = await authClient.getSession({
    fetchOptions: {
      auth: {
        type: 'Bearer',
        token: accessToken,
      },
    },
  })
  return data
}
