import type { OIDCFlowParams, TokenResponse } from './auth-oidc'

import { createAuthClient } from 'better-auth/vue'

import { useAuthStore } from '../stores/auth'
import { OIDC_CLIENT_ID, OIDC_REDIRECT_URI } from './auth-config'
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

  // NOTICE: restoreRefreshSchedule must complete BEFORE fetchSession when
  // the persisted access token is already expired. Otherwise fetchSession
  // hits /get-session with the stale Bearer, gets 401, and wipes
  // refreshToken + oidcClientId before the scheduled refresh can run —
  // silently logging the user out on reload.
  const authStore = useAuthStore()
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
  // Persist the ID token so signOut() can drive RP-Initiated Logout via
  // `id_token_hint`. Token rotation does not refresh the ID token, so the
  // value captured here at sign-in time is the one we use for the lifetime
  // of the local session.
  if (tokens.id_token)
    authStore.idToken = tokens.id_token

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
  authStore.clearOIDCState()
  return false
}

export async function listSessions() {
  return await authClient.listSessions()
}

export async function signOut() {
  const authStore = useAuthStore()

  // Capture the bits we need before clearOIDCState() wipes them.
  const idTokenHint = authStore.idToken
  const clientId = authStore.oidcClientId
  const bearerToken = authStore.token

  // NOTICE:
  // Authoritative server-side sign-out FIRST, then local clear. Do NOT make
  // this optimistic.
  //
  // Why: the better-auth session cookie is SameSite=Lax. A top-level
  // navigation to `/oauth2/authorize` (i.e. clicking "sign in" right after
  // logout) will attach that cookie. If we clear local state first and let
  // the user trigger a fresh OIDC flow before /end-session has actually
  // deleted the session row, the server resolves the still-live row and
  // silently re-issues tokens for the just-logged-out account. The user
  // ends up logged back in as the previous identity.
  //
  // We pay the round-trip latency on the logout click in exchange for
  // killing that race. Callers must display a loading indicator while
  // awaiting (profile.vue gates the button via `signOutLoading`).
  //
  // OIDC RP-Initiated Logout (`/api/auth/oauth2/end-session`) is the
  // Bearer-friendly path: it accepts `id_token_hint`, decodes the `sid`
  // claim, and deletes the corresponding `session` row via
  // `internalAdapter.deleteSession(session.token)`. Source:
  // node_modules/@better-auth/oauth-provider/dist/index.mjs L996+. Requires
  // the trusted OIDC client to be seeded with `enableEndSession: true`.
  //
  // Fallback to /api/auth/sign-out for sessions that pre-date id_token
  // persistence (applyOIDCTokens started saving id_token in this branch);
  // without it, those legacy sessions would skip server cleanup and hit
  // exactly the silent-re-login bug described above.
  try {
    if (idTokenHint && clientId) {
      const url = new URL('/api/auth/oauth2/end-session', SERVER_URL)
      url.searchParams.set('id_token_hint', idTokenHint)
      url.searchParams.set('client_id', clientId)
      await fetch(url.toString(), { method: 'GET' })
    }
    else if (bearerToken) {
      const url = new URL('/api/auth/sign-out', SERVER_URL)
      await fetch(url.toString(), {
        method: 'POST',
        headers: { Authorization: `Bearer ${bearerToken}` },
      })
    }
  }
  catch {
    // Network failure: still clear local state below. Server-side row will
    // expire by TTL; the local refreshToken/idToken/clientId are about to
    // be wiped, so the local user has no way to spend it in the meantime.
  }

  authStore.clearOIDCState()
  authStore.user = null
  authStore.session = null
  authStore.token = null
  authStore.refreshToken = null
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

/**
 * Trigger the project-default OIDC sign-in flow.
 *
 * Use when:
 * - Any UI surface needs to start a login (top-nav button, 401 handler,
 *   onboarding gate, "Try again" on a failed callback). Sign-in is an
 *   action, not a page — callers do NOT navigate to a sign-in route first.
 *
 * Expects:
 * - `auth-config.ts` provides `OIDC_CLIENT_ID` and `OIDC_REDIRECT_URI` for
 *   the current app (web vs. tamagotchi vs. pocket).
 *
 * Returns:
 * - Resolves after the browser has been navigated. In practice the page
 *   unloads, so callers usually do not see the resolution.
 *
 * `opts.provider` (optional): skip the picker page and jump straight to a
 * social provider. Omit to land on the project's hosted login page
 * (ui-server-auth) where the user can choose email/password or social.
 */
export async function triggerSignIn(opts?: { provider?: OAuthProvider }): Promise<void> {
  await signInOIDC({
    clientId: OIDC_CLIENT_ID,
    redirectUri: OIDC_REDIRECT_URI,
    ...opts,
  })
}
