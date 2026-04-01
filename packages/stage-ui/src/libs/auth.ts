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
    // Capture session token from bearer plugin's `set-auth-token` response header
    // (returned on sign-in/sign-up API calls that aren't redirects).
    onResponse(context) {
      const token = context.response.headers.get('set-auth-token')
      if (token) {
        useAuthStore().token = token
      }
    },
  },
})

let initialized = false

export function initializeAuth() {
  if (initialized)
    return

  // NOTICE: OIDC callback is handled by the dedicated callback page
  // (e.g. /auth/callback). initializeAuth() only restores existing
  // sessions and refresh schedules — it does NOT consume the code.

  fetchSession().catch(() => {})

  // Restore OIDC token refresh scheduling from persisted state
  const authStore = useAuthStore()
  authStore.restoreRefreshSchedule()

  // Wire up token refresh → session bridge so the store can trigger
  // session exchange without importing auth.ts (avoids circular deps).
  authStore.onTokenRefreshed(async (accessToken) => {
    await exchangeOIDCTokenForSession(accessToken)
    await fetchSession()
  })

  initialized = true
}

/**
 * Bridge OIDC tokens into a better-auth session and schedule refresh.
 *
 * 1. Exchanges the OIDC access token for a better-auth session token via the
 *    server bridge endpoint (the OIDC token is never stored in authStore.token).
 * 2. Persists the OIDC refresh token + client info so refresh works after reload.
 * 3. Schedules automatic OIDC token refresh at 80% of lifetime.
 */
export async function bridgeOIDCTokens(tokens: TokenResponse, clientId: string): Promise<void> {
  // Exchange OIDC access token for a better-auth session token
  await exchangeOIDCTokenForSession(tokens.access_token)

  const authStore = useAuthStore()
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
  authStore.user = null
  authStore.session = null
  authStore.token = null
  authStore.refreshToken = null
  return false
}

export async function listSessions() {
  return await authClient.listSessions()
}

export async function signOut() {
  const authStore = useAuthStore()
  authStore.clearOIDCState()

  // NOTICE: Server signOut is wrapped in try/catch so that local state cleanup
  // always runs regardless of server errors (e.g. network unreachable). User
  // intent to log out is respected — the server session expires naturally.
  try {
    await authClient.signOut()
  }
  catch {
    // Swallow — local cleanup below ensures the user is logged out client-side.
  }

  authStore.user = null
  authStore.session = null
  authStore.token = null
  authStore.refreshToken = null
}

/**
 * Exchange an OIDC access token for a better-auth session token via the
 * server bridge endpoint. The OIDC token is passed as an argument and never
 * written to the auth store — only the returned session token is persisted.
 */
export async function exchangeOIDCTokenForSession(oidcAccessToken: string): Promise<void> {
  const res = await fetch(`${SERVER_URL}/api/auth/oidc/session`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${oidcAccessToken}` },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: 'Bridge exchange failed' }))
    throw new Error(body.message ?? 'Bridge exchange failed')
  }

  const { token } = await res.json() as { token: string }
  useAuthStore().token = token
}

/**
 * Initiate OIDC Authorization Code + PKCE login flow.
 * Builds the authorization URL, persists PKCE state, and navigates.
 */
export async function signInOIDC(params: OIDCFlowParams) {
  const { url, flowState } = await buildAuthorizationURL(params)
  persistFlowState(flowState, params)
  window.location.href = url
}
