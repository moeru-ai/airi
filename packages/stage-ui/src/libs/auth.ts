import { useAuthStore } from '../stores/auth'
import { SERVER_URL } from './server'

export type OAuthProvider = 'google' | 'github'

const BASE64_DASH = /-/g
const BASE64_UNDERSCORE = /_/g

const TOKEN_STORAGE_KEY = 'auth/v1/tokens'

interface StoredTokens {
  accessToken: string
  refreshToken: string
}

/**
 * Get stored JWT tokens from localStorage.
 */
export function getStoredTokens(): StoredTokens | null {
  try {
    const raw = localStorage.getItem(TOKEN_STORAGE_KEY)
    if (!raw)
      return null
    return JSON.parse(raw) as StoredTokens
  }
  catch {
    return null
  }
}

/**
 * Store JWT tokens in localStorage.
 */
export function storeTokens(tokens: StoredTokens): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens))
}

/**
 * Clear stored JWT tokens.
 */
export function clearTokens(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY)
}

/**
 * Get the current access token, refreshing if needed.
 */
export async function getAccessToken(): Promise<string | null> {
  const tokens = getStoredTokens()
  if (!tokens)
    return null

  // Check if access token is expired by decoding it
  if (!isTokenExpired(tokens.accessToken)) {
    return tokens.accessToken
  }

  // Try to refresh
  const newAccessToken = await refreshAccessToken(tokens.refreshToken)
  if (newAccessToken) {
    storeTokens({ accessToken: newAccessToken, refreshToken: tokens.refreshToken })
    return newAccessToken
  }

  // Refresh failed, clear tokens
  clearTokens()
  return null
}

/**
 * Check if a JWT token is expired (with 60s buffer).
 */
function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split('.')
    if (parts.length !== 3)
      return true
    const payload = JSON.parse(atob(parts[1].replace(BASE64_DASH, '+').replace(BASE64_UNDERSCORE, '/')))
    // 60 second buffer before actual expiry
    return (payload.exp * 1000) < (Date.now() - 60_000)
  }
  catch {
    return true
  }
}

/**
 * Refresh the access token using a refresh token.
 */
async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  try {
    const res = await fetch(`${SERVER_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    if (!res.ok)
      return null
    const data = await res.json() as { accessToken: string }
    return data.accessToken
  }
  catch {
    return null
  }
}

let initialized = false

/**
 * Initialize auth state from stored tokens or URL params (after OAuth callback).
 */
export function initializeAuth() {
  if (initialized)
    return

  // Check URL params for tokens (after OAuth callback redirect)
  handleOAuthCallback()

  fetchSession().catch(() => {})
  initialized = true
}

/**
 * Handle OAuth callback by extracting tokens from URL params.
 */
function handleOAuthCallback(): void {
  const url = new URL(window.location.href)
  const accessToken = url.searchParams.get('access_token')
  const refreshToken = url.searchParams.get('refresh_token')
  const error = url.searchParams.get('error')

  if (error) {
    // Clean up URL params
    url.searchParams.delete('error')
    url.searchParams.delete('reason')
    window.history.replaceState({}, '', url.pathname + url.search)
    return
  }

  if (accessToken && refreshToken) {
    storeTokens({ accessToken, refreshToken })

    // Clean up URL params
    url.searchParams.delete('access_token')
    url.searchParams.delete('refresh_token')
    window.history.replaceState({}, '', url.pathname + url.search)
  }
}

/**
 * Fetch the current session (user info) from the server.
 */
export async function fetchSession(): Promise<boolean> {
  const accessToken = await getAccessToken()
  const authStore = useAuthStore()

  if (!accessToken) {
    authStore.user = null
    return false
  }

  try {
    const res = await fetch(`${SERVER_URL}/api/auth/session`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!res.ok) {
      authStore.user = null
      clearTokens()
      return false
    }

    const data = await res.json() as { user: { id: string, name: string, email: string, emailVerified: boolean, image: string | null, createdAt: string, updatedAt: string } }
    authStore.user = data.user
    return true
  }
  catch {
    authStore.user = null
    return false
  }
}

/**
 * List all active sessions for the current user.
 */
export async function listSessions() {
  const accessToken = await getAccessToken()
  if (!accessToken)
    return { data: null }

  try {
    const res = await fetch(`${SERVER_URL}/api/auth/sessions`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok)
      return { data: null }
    const data = await res.json()
    return { data }
  }
  catch {
    return { data: null }
  }
}

/**
 * Sign out — revoke the refresh token and clear local state.
 */
export async function signOut() {
  const tokens = getStoredTokens()

  if (tokens?.refreshToken) {
    try {
      await fetch(`${SERVER_URL}/api/auth/sign-out`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      })
    }
    catch {
      // Best-effort sign-out
    }
  }

  clearTokens()
  const authStore = useAuthStore()
  authStore.user = null
}

/**
 * Initiate OAuth sign-in by redirecting to the server's login endpoint.
 * The server will redirect to the OAuth provider, then back with tokens.
 */
export async function signIn(provider: OAuthProvider) {
  const redirectUrl = window.location.origin + window.location.pathname
  const loginUrl = `${SERVER_URL}/api/auth/login/${provider}?redirect=${encodeURIComponent(redirectUrl)}`
  window.location.href = loginUrl
}
