import type { OIDCFlowParams, TokenResponse } from './auth-oidc'

import { createAuthClient } from 'better-auth/vue'

import { useAuthStore } from '../stores/auth'
import { buildAuthorizationURL, consumeFlowState, exchangeCodeForTokens, persistFlowState, refreshAccessToken } from './auth-oidc'
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
let refreshTimer: ReturnType<typeof setTimeout> | null = null

export function initializeAuth() {
  if (initialized)
    return

  // Handle OIDC callback if we're on the callback page with a code
  handleOIDCCallback().catch(() => {})

  fetchSession().catch(() => {})
  initialized = true
}

/**
 * Persist tokens from a TokenResponse into the auth store and schedule
 * automatic refresh.
 */
export function persistTokens(tokens: TokenResponse, clientId: string): void {
  const authStore = useAuthStore()
  authStore.token = tokens.access_token
  if (tokens.refresh_token)
    authStore.refreshToken = tokens.refresh_token

  scheduleTokenRefresh(tokens.expires_in, clientId)
}

/**
 * Schedule a token refresh at 80% of the token's lifetime.
 */
function scheduleTokenRefresh(expiresIn: number, clientId: string): void {
  if (refreshTimer)
    clearTimeout(refreshTimer)

  // Refresh at 80% of lifetime
  const refreshMs = expiresIn * 0.8 * 1000
  refreshTimer = setTimeout(async () => {
    const authStore = useAuthStore()
    if (!authStore.refreshToken)
      return

    try {
      const tokens = await refreshAccessToken(clientId, authStore.refreshToken)
      persistTokens(tokens, clientId)
    }
    catch {
      // Refresh failed — clear auth state
      authStore.token = null
      authStore.refreshToken = null
    }
  }, refreshMs)
}

/**
 * Handle the OIDC authorization code callback.
 * Extracts code and state from URL query params, exchanges for tokens.
 */
async function handleOIDCCallback(): Promise<boolean> {
  const url = new URL(window.location.href)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  if (!code || !state)
    return false

  const persisted = consumeFlowState()
  if (!persisted)
    return false

  const tokens = await exchangeCodeForTokens(code, persisted.flowState, persisted.params, state)
  persistTokens(tokens, persisted.params.clientId)

  // Clean the query params from the URL
  url.searchParams.delete('code')
  url.searchParams.delete('state')
  url.searchParams.delete('iss')
  window.history.replaceState(null, '', url.pathname + url.search)

  return true
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
  if (refreshTimer) {
    clearTimeout(refreshTimer)
    refreshTimer = null
  }

  // NOTICE: Server signOut is wrapped in try/catch so that local state cleanup
  // always runs regardless of server errors (e.g. network unreachable). User
  // intent to log out is respected — the server session expires naturally.
  try {
    await authClient.signOut()
  }
  catch {
    // Swallow — local cleanup below ensures the user is logged out client-side.
  }

  const authStore = useAuthStore()
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
