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

// Persisted OIDC client config for refresh after page reload
const OIDC_CLIENT_KEY = 'auth/v1/oidc-client-id'
const OIDC_CLIENT_SECRET_KEY = 'auth/v1/oidc-client-secret'
const OIDC_TOKEN_EXPIRY_KEY = 'auth/v1/oidc-token-expiry'

export function initializeAuth() {
  if (initialized)
    return

  // Handle OIDC callback if we're on the callback page with a code
  handleOIDCCallback().catch(() => {})

  fetchSession().catch(() => {})

  // Restore OIDC token refresh scheduling from persisted state
  restoreRefreshSchedule()

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
export async function bridgeOIDCTokens(tokens: TokenResponse, clientId: string, clientSecret?: string): Promise<void> {
  // Exchange OIDC access token for a better-auth session token
  await exchangeOIDCTokenForSession(tokens.access_token)

  const authStore = useAuthStore()
  if (tokens.refresh_token)
    authStore.refreshToken = tokens.refresh_token

  // Persist client info for refresh after page reload
  localStorage.setItem(OIDC_CLIENT_KEY, clientId)
  if (clientSecret)
    localStorage.setItem(OIDC_CLIENT_SECRET_KEY, clientSecret)
  if (tokens.expires_in) {
    const expiryMs = Date.now() + tokens.expires_in * 1000
    localStorage.setItem(OIDC_TOKEN_EXPIRY_KEY, String(expiryMs))
  }

  scheduleTokenRefresh(tokens.expires_in, clientId, clientSecret)
}

/**
 * @deprecated Use `bridgeOIDCTokens` instead — this stores the OIDC access
 * token directly, which is wrong for better-auth session lookups.
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
function scheduleTokenRefresh(expiresIn: number, clientId: string, clientSecret?: string): void {
  if (refreshTimer)
    clearTimeout(refreshTimer)

  // Refresh at 80% of lifetime
  const refreshMs = expiresIn * 0.8 * 1000
  refreshTimer = setTimeout(async () => {
    const authStore = useAuthStore()
    if (!authStore.refreshToken)
      return

    try {
      const tokens = await refreshAccessToken(clientId, authStore.refreshToken, clientSecret)
      // Bridge the refreshed OIDC token into a new session
      await bridgeOIDCTokens(tokens, clientId, clientSecret)
      await fetchSession()
    }
    catch {
      // Refresh failed — clear auth state
      authStore.token = null
      authStore.refreshToken = null
    }
  }, refreshMs)
}

/**
 * Restore refresh scheduling from persisted localStorage state after page
 * reload. Calculates remaining lifetime from the stored expiry timestamp.
 */
function restoreRefreshSchedule(): void {
  const authStore = useAuthStore()
  if (!authStore.refreshToken)
    return

  const clientId = localStorage.getItem(OIDC_CLIENT_KEY)
  if (!clientId)
    return

  const clientSecret = localStorage.getItem(OIDC_CLIENT_SECRET_KEY) ?? undefined
  const expiryRaw = localStorage.getItem(OIDC_TOKEN_EXPIRY_KEY)

  if (expiryRaw) {
    const remainingMs = Number(expiryRaw) - Date.now()
    if (remainingMs > 0) {
      // Convert remaining ms to seconds for scheduleTokenRefresh
      scheduleTokenRefresh(remainingMs / 1000, clientId, clientSecret)
      return
    }
  }

  // Token already expired or no expiry info — refresh immediately
  scheduleTokenRefresh(0, clientId, clientSecret)
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
  await bridgeOIDCTokens(tokens, persisted.params.clientId, persisted.params.clientSecret)

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

  // Clean up persisted OIDC client info
  localStorage.removeItem(OIDC_CLIENT_KEY)
  localStorage.removeItem(OIDC_CLIENT_SECRET_KEY)
  localStorage.removeItem(OIDC_TOKEN_EXPIRY_KEY)
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
