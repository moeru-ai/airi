import { useAuthStore } from '../stores/auth'
import { getAnalyticsIdentityHeaders } from './product-signals'
import { SERVER_URL } from './server'

/**
 * Fetch wrapper that transparently refreshes the OIDC access token on 401
 * and retries the original request once. Refresh is single-flight across
 * concurrent callers via the auth store's `refreshTokenNow()` action.
 *
 * Why not rely on the proactive 80%-lifetime scheduler alone: clock skew,
 * suspended tabs, and the post-reload race (fetchSession firing before
 * restoreRefreshSchedule resolves) can all leak an expired Bearer through.
 * The reactive 401 path is the safety net.
 *
 * When refresh cannot succeed — missing state (refreshToken/oidcClientId),
 * a rejected refresh token, or a retried request that still returns 401 —
 * clear local auth state and flip `needsLogin` so the user is prompted to
 * sign in immediately, instead of letting the dead session linger until the
 * next fetchSession call on the home page.
 *
 * A refresh that fails for a reason that can pass, such as a network error or
 * a 5xx, keeps the refresh token. This wrapper then returns the 401 and keeps
 * the credentials, because the auth store already scheduled a retry.
 *
 * Request headers apply unless `init.headers` replaces them. Each attempt clones
 * the Request so its body stays available for the retry.
 */
export async function authedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const authStore = useAuthStore()
  const version = authStore.sessionVersion
  const request = input instanceof Request ? input : undefined
  const doFetch = (token: string | null): Promise<Response> => {
    const headers = new Headers(init?.headers ?? request?.headers)
    if (token)
      headers.set('Authorization', `Bearer ${token}`)
    // Only the API receives the analytics identity. Other origins never see the ids.
    const identityHeaders = isApiRequest(input) ? getAnalyticsIdentityHeaders() : null
    if (identityHeaders) {
      for (const [name, value] of Object.entries(identityHeaders))
        headers.set(name, value)
    }
    return fetch(request ? request.clone() : input, { ...init, headers, credentials: 'omit' })
  }

  const response = await doFetch(authStore.token)
  if (response.status !== 401)
    return response

  // Don't recurse on the token endpoint itself
  const url = typeof input === 'string'
    ? input
    : input instanceof URL ? input.toString() : input.url
  if (url.includes('/oauth2/token'))
    return response

  const newToken = await authStore.refreshTokenNow(version)
  // Refresh checks ownership in the leader. Check again before retrying here.
  if (version !== authStore.sessionVersion)
    return response

  if (!newToken) {
    // The store clears the refresh token when the server rejects it. A remaining
    // refresh token means that the refresh failed for a reason that can pass.
    if (!authStore.refreshToken)
      await authStore.expireSession(version)
    return response
  }

  const retried = await doFetch(newToken)
  if (retried.status === 401)
    await authStore.expireSession(version)
  return retried
}

function isApiRequest(input: RequestInfo | URL): boolean {
  const url = typeof input === 'string'
    ? input
    : input instanceof URL ? input.toString() : input.url

  return new URL(url, SERVER_URL).origin === new URL(SERVER_URL).origin
}
