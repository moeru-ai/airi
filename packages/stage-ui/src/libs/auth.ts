import type { OIDCFlowParams, TokenResponse } from './auth-oidc'

import { createAuthClient } from 'better-auth/vue'

import { useAuthStore } from '../stores/auth'
import { buildAuthorizationURL, persistFlowState } from './auth-oidc'
import { SERVER_URL } from './server'

export type OAuthProvider = 'google' | 'github'

// NOTICE: reads the same localStorage key ('auth/v1/token') that useAuthStore's
// `token` ref writes via useLocalStorage. We bypass the store here because
// authClient is initialized at module scope, before Pinia is active — calling
// useAuthStore() at this point would throw. The two stay in sync because
// useLocalStorage and raw localStorage share the same underlying storage entry.
export function getAuthToken(): string | null {
  return localStorage.getItem('auth/v1/token')
}

export const authClient = createAuthClient({
  baseURL: SERVER_URL,
  fetchOptions: {
    // NOTICE: better-auth's client hardcodes `credentials: "include"` by default
    // (config.mjs L40), which causes cookies to be sent alongside the Authorization
    // header. We override with "omit" so only the Bearer token is used for auth.
    // This works because restOfFetchOptions is spread AFTER the default (L47).
    credentials: 'omit',
    auth: {
      type: 'Bearer',
      token: () => getAuthToken() ?? '',
    },
  },
})

let initialized = false

export async function initializeAuth() {
  if (initialized)
    return

  // NOTICE: OIDC callback is handled by the dedicated callback page
  // (e.g. /auth/callback). initializeAuth() only restores existing
  // sessions and refresh schedules — it does NOT consume the code.

  initialized = true

  const authStore = useAuthStore()

  // Normalize "half-cleared" persisted state before anything reads it.
  //
  // Why: `refreshToken` was added to the auth store before `oidcClientId`
  // (commit c73ceeb1f predates f1fe161bc), and `clearOIDCState` (now removed)
  // used to clear only the OIDC pair. Browsers that saw either code path can
  // end up with a refreshToken but no oidcClientId, which makes
  // `refreshTokenNow()` early-return forever — 401s then silently accumulate
  // on non-home pages until the user lands on a route that calls fetchSession.
  //
  // Treat any mismatch as an unauthenticated session; the user will get a
  // fresh OIDC login prompt via the standard 401→needsLogin path.
  const hasRefreshToken = !!authStore.refreshToken
  const hasClientId = !!authStore.oidcClientId
  if (hasRefreshToken !== hasClientId)
    authStore.clearAllAuthState()

  // NOTICE: restoreRefreshSchedule must complete BEFORE fetchSession when
  // the persisted access token is already expired. Otherwise fetchSession
  // hits /get-session with the stale Bearer, gets 401, and wipes
  // refreshToken + oidcClientId before the scheduled refresh can run —
  // silently logging the user out on reload.
  authStore.onTokenRefreshed(async (accessToken) => {
    authStore.token = accessToken
    await fetchSession()
  })

  await authStore.restoreRefreshSchedule()
  await fetchSession().catch(() => {})
}

/**
 * Persist OIDC tokens locally and schedule refresh.
 */
export async function applyOIDCTokens(tokens: TokenResponse, clientId: string): Promise<void> {
  const authStore = useAuthStore()
  authStore.token = tokens.access_token
  if (tokens.refresh_token)
    authStore.refreshToken = tokens.refresh_token

  // Persist client info for refresh after page reload
  authStore.oidcClientId = clientId
  if (tokens.expires_in)
    authStore.tokenExpiry = Date.now() + tokens.expires_in * 1000

  authStore.scheduleTokenRefresh(tokens.expires_in)
}

export async function fetchSession() {
  const { data } = await authClient.getSession()
  const authStore = useAuthStore()

  if (data) {
    authStore.user = data.user
    authStore.session = data.session
    return true
  }

  // Session expired or invalid — clear stale auth state from localStorage
  authStore.clearAllAuthState()
  return false
}

export async function listSessions() {
  return await authClient.listSessions()
}

export async function signOut() {
  const authStore = useAuthStore()

  // NOTICE: Server signOut is wrapped in try/catch so that local state cleanup
  // always runs regardless of server errors (e.g. network unreachable). User
  // intent to sign out is respected even if token revocation fails server-side.
  try {
    await authClient.signOut()
  }
  catch {
    // Swallow — local cleanup below ensures the user is signed out client-side.
  }

  authStore.clearAllAuthState()
}

/**
 * Initiate OIDC Authorization Code + PKCE sign-in flow.
 * Builds the authorization URL, persists PKCE state, and navigates.
 */
export async function signInOIDC(params: OIDCFlowParams) {
  const { provider, ...oidcParams } = params
  const { url, flowState } = await buildAuthorizationURL(oidcParams)
  persistFlowState(flowState, params)

  if (!provider) {
    window.location.href = url
    return
  }

  await authClient.signIn.social({
    provider,
    callbackURL: url.toString(),
  })
}
