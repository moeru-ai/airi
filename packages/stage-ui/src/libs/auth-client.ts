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
 *
 * Returns null only when the server says that the token is not authenticated.
 * Throws when the server cannot answer, for example on a network error, a 5xx, or a 429.
 * The auth store keeps the credentials for a thrown error and clears them for null.
 */
export async function requestAuthSession(accessToken: string | null) {
  if (!accessToken)
    return null

  const { data, error } = await authClient.getSession({
    fetchOptions: {
      auth: {
        type: 'Bearer',
        token: accessToken,
      },
    },
  })
  // `/api/auth/get-session` answers JSON null with 200 for an unknown, expired, or banned token.
  // A 401 also rejects the token. Every other error status describes the server, not the token.
  if (error && error.status !== 401)
    throw new Error(`Session request failed: ${error.status} ${error.statusText}`)
  return data
}
