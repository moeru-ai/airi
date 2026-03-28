import { createAuthClient } from 'better-auth/vue'

import { useAuthStore } from '../stores/auth'
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
    // OAuth flow delivers the token via URL query param (`auth_token`) instead.
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
        localStorage.setItem('auth/v1/token', token)
      }
    },
  },
})

let initialized = false

export function initializeAuth() {
  if (initialized)
    return

  // Pick up auth_token from OAuth callback redirect URL
  extractTokenFromURL()

  fetchSession().catch(() => {})
  initialized = true
}

/**
 * After OAuth callback, the server appends `?auth_token=<token>` to the
 * redirect URL. Extract it, persist to the auth store, and clean the URL.
 */
function extractTokenFromURL() {
  const params = new URLSearchParams(window.location.search)
  const token = params.get('auth_token')
  if (!token)
    return

  // Persist immediately via raw localStorage so getAuthToken() picks it up
  // before the Pinia store is hydrated.
  localStorage.setItem('auth/v1/token', token)

  // Clean the token from the URL to avoid leaking it in browser history
  params.delete('auth_token')
  const cleaned = params.toString()
  const newURL = `${window.location.pathname}${cleaned ? `?${cleaned}` : ''}${window.location.hash}`
  window.history.replaceState(null, '', newURL)
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
  return false
}

export async function listSessions() {
  return await authClient.listSessions()
}

export async function signOut() {
  await authClient.signOut()

  const authStore = useAuthStore()
  authStore.user = null
  authStore.session = null
  authStore.token = null
}

export async function signIn(provider: OAuthProvider) {
  return await authClient.signIn.social({
    provider,
    callbackURL: window.location.origin,
  })
}
