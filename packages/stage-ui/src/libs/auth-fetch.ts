import { useAuthStore } from '../stores/auth'
import { getAuthToken } from './auth'

/**
 * Fetch wrapper that transparently refreshes the OIDC access token on 401
 * and retries the original request once. Refresh is single-flight across
 * concurrent callers via the auth store's `refreshTokenNow()` action.
 *
 * Why not rely on the proactive 80%-lifetime scheduler alone: clock skew,
 * suspended tabs, and the post-reload race (fetchSession firing before
 * restoreRefreshSchedule resolves) can all leak an expired Bearer through.
 * The reactive 401 path is the safety net.
 */
export async function authedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const doFetch = (token: string | null): Promise<Response> => {
    const headers = new Headers(init?.headers)
    if (token)
      headers.set('Authorization', `Bearer ${token}`)
    return fetch(input, { ...init, headers, credentials: 'omit' })
  }

  const response = await doFetch(getAuthToken())
  if (response.status !== 401)
    return response

  // Don't recurse on the token endpoint itself
  const url = typeof input === 'string'
    ? input
    : input instanceof URL ? input.toString() : input.url
  if (url.includes('/oauth2/token'))
    return response

  const newToken = await useAuthStore().refreshTokenNow()
  if (!newToken)
    return response

  return doFetch(newToken)
}
