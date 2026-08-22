import type { Session, User } from 'better-auth'
import type {} from 'pinia-plugin-synced'

import { errorMessageFrom } from '@moeru/std'
import { isStageTamagotchi } from '@proj-airi/stage-shared'
import { useTimeoutFn, whenever } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import { client } from '../composables/api'
import { useBreakpoints } from '../composables/use-breakpoints'
import { triggerSignIn } from '../libs/auth'
import { authClient, requestAuthSession } from '../libs/auth-client'
import { refreshAccessToken } from '../libs/auth-oidc'
import { SERVER_URL } from '../libs/server'

function createLocalStorageForAuth() {
  const keys = {
    accessToken: 'auth/v1/token',
    refreshToken: 'auth/v1/refresh-token',
    idToken: 'auth/v1/oidc-id-token',
    oidcClientId: 'auth/v1/oidc-client-id',
    tokenExpiry: 'auth/v1/oidc-token-expiry',
  } as const

  function setOptional(key: string, value: string | null): void {
    if (value === null) {
      localStorage.removeItem(key)
      return
    }

    localStorage.setItem(key, value)
  }

  return {
    clear() {
      for (const key of Object.values(keys))
        localStorage.removeItem(key)
    },
    getAccessToken: () => localStorage.getItem(keys.accessToken),
    getRefreshToken: () => localStorage.getItem(keys.refreshToken),
    getIdToken: () => localStorage.getItem(keys.idToken),
    getOidcClientId: () => localStorage.getItem(keys.oidcClientId),
    getTokenExpiry() {
      const expiry = Number.parseInt(localStorage.getItem(keys.tokenExpiry) ?? '', 10)
      return Number.isFinite(expiry) ? expiry : null
    },
    setAccessToken: (value: string | null) => setOptional(keys.accessToken, value),
    setRefreshToken: (value: string | null) => setOptional(keys.refreshToken, value),
    setIdToken: (value: string | null) => setOptional(keys.idToken, value),
    setOidcClientId: (value: string | null) => setOptional(keys.oidcClientId, value),
    setTokenExpiry: (value: number | null) => setOptional(keys.tokenExpiry, value?.toString() ?? null),
  }
}

/** Tokens that complete one OIDC sign-in flow. */
export interface AuthTokenSet {
  accessToken: string
  refreshToken?: string
  idToken?: string
  expiresIn: number
  clientId: string
}

// Keep this private: callers depend on the timeout behavior, not the value.
const SIGN_OUT_REQUEST_TIMEOUT_MS = 8_000

function createSignOutTimeoutSignal(timeoutMs: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function')
    return AbortSignal.timeout(timeoutMs)

  // NOTICE: stage-pocket targets iOS 15, whose WKWebView does not provide
  // AbortSignal.timeout. Remove this branch when the deployment target moves
  // to iOS 16+, where the native helper is available.
  const controller = new AbortController()
  setTimeout(() => controller.abort(), timeoutMs)
  return controller.signal
}

/**
 * Auth store — holds identity state and credits.
 *
 * This store has no dependency on `stores/providers`, which allows
 * `providers` to safely depend on it without creating a circular import.
 */
export const useAuthStore = defineStore('auth', () => {
  const storage = createLocalStorageForAuth()

  // Pinia owns live auth state. Persistence is command-driven so a state patch
  // received from another window cannot write back into the transport.
  const user = ref<User | null>(null)
  const session = ref<Session | null>(null)
  const token = ref<string | null>(null)
  const refreshToken = ref<string | null>(null)
  // NOTICE:
  // Persisted to drive `id_token_hint` on RP-Initiated Logout
  // (`/api/auth/oauth2/end-session`). The `sid` claim inside the ID token is
  // what lets the OIDC provider locate the server-side session row to delete
  // — without this we'd be back to relying on cross-site session cookies.
  const idToken = ref<string | null>(null)
  const isAuthenticated = computed(() => !!user.value && !!session.value)
  const userId = computed(() => user.value?.id ?? 'local')

  // --- OIDC token refresh state ---
  const oidcClientId = ref<string | null>(null)
  const tokenExpiry = ref<number | null>(null)
  const initialized = ref(false)

  const credits = ref(0)

  // Cross-app "user must log in" flag. Setting this to true triggers an
  // immediate OIDC redirect on web (mobile + desktop). Electron skips this
  // path because controls-island-auth-button listens for IPC and handles
  // sign-in in the main process.
  const needsLogin = ref(false)
  const { isMobile } = useBreakpoints()

  whenever(needsLogin, async () => {
    if (isStageTamagotchi())
      return

    // Consume the request before opening an external browser. Pocket stays
    // mounted when the user cancels there, so leaving this true would make
    // the next button click a no-op instead of starting a new OIDC flow.
    needsLogin.value = false
    await triggerSignIn()
  })

  // Reset the flag if the viewport class flips, so a stale needsLogin from a
  // previous breakpoint does not surface again on resize.
  watch(isMobile, () => needsLogin.value = false)

  // --- Lifecycle hooks ---
  type AuthHook = () => void | Promise<void>
  const authenticatedHooks: AuthHook[] = []
  const logoutHooks: AuthHook[] = []

  function onAuthenticated(hook: AuthHook) {
    authenticatedHooks.push(hook)
    // If already authenticated when hook is registered, fire immediately.
    // This covers the case where auth resolves before the hook is registered.
    if (isAuthenticated.value) {
      hook()
    }
    return () => {
      const idx = authenticatedHooks.indexOf(hook)
      if (idx >= 0)
        authenticatedHooks.splice(idx, 1)
    }
  }

  function onLogout(hook: AuthHook) {
    logoutHooks.push(hook)
    return () => {
      const idx = logoutHooks.indexOf(hook)
      if (idx >= 0)
        logoutHooks.splice(idx, 1)
    }
  }

  // --- OIDC token refresh scheduling ---
  // Uses useTimeoutFn for automatic cleanup on store teardown.
  // The delay ref is updated by scheduleTokenRefresh before calling start().

  const refreshDelayMs = ref(0)
  // Single-flight refresh: multiple concurrent callers (timer + 401 retry + restore)
  // must not trigger multiple token exchanges. All share one in-flight promise.
  let inflightRefresh: Promise<string | null> | null = null

  async function refreshTokenNow(): Promise<string | null> {
    if (inflightRefresh)
      return inflightRefresh

    if (!refreshToken.value || !oidcClientId.value)
      return null

    inflightRefresh = (async () => {
      try {
        const tokens = await refreshAccessToken(oidcClientId.value!, refreshToken.value!)
        token.value = tokens.access_token
        storage.setAccessToken(tokens.access_token)
        if (tokens.refresh_token) {
          refreshToken.value = tokens.refresh_token
          storage.setRefreshToken(tokens.refresh_token)
        }
        if (tokens.expires_in) {
          tokenExpiry.value = Date.now() + tokens.expires_in * 1000
          storage.setTokenExpiry(tokenExpiry.value)
          scheduleTokenRefresh(tokens.expires_in)
        }

        await fetchSession(tokens.access_token)
        return tokens.access_token
      }
      catch (error) {
        console.error('OIDC token refresh failed', errorMessageFrom(error))
        clearAuthState()
        return null
      }
      finally {
        inflightRefresh = null
      }
    })()

    return inflightRefresh
  }

  const { start: startRefreshTimer, stop: stopRefreshTimer } = useTimeoutFn(
    () => { void useAuthStore().refreshTokenNow() },
    refreshDelayMs,
    { immediate: false },
  )

  function scheduleTokenRefresh(expiresInSeconds: number): void {
    stopRefreshTimer()
    // Guard against missing/invalid lifetimes (e.g. token response omitted
    // expires_in). useTimeoutFn with NaN/<=0 delay would fire immediately
    // and spin a refresh loop — skip scheduling instead.
    if (!Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0)
      return
    // Refresh at 80% of lifetime
    refreshDelayMs.value = expiresInSeconds * 0.8 * 1000
    startRefreshTimer()
  }

  /**
   * Restore refresh scheduling from persisted state after page reload.
   * Returns a promise that resolves after an immediate refresh completes
   * (when the persisted token is already expired) so callers can avoid
   * racing `fetchSession()` against a stale Bearer token.
   */
  async function restoreRefreshSchedule(): Promise<boolean> {
    if (!refreshToken.value || !oidcClientId.value)
      return false

    if (tokenExpiry.value) {
      const remainingMs = tokenExpiry.value - Date.now()
      if (remainingMs > 0) {
        scheduleTokenRefresh(remainingMs / 1000)
        return false
      }
    }

    // Already expired — refresh synchronously so subsequent requests use fresh token
    return !!(await refreshTokenNow())
  }

  async function initialize(): Promise<void> {
    if (initialized.value)
      return

    initialized.value = true

    token.value = storage.getAccessToken()
    refreshToken.value = storage.getRefreshToken()
    idToken.value = storage.getIdToken()
    oidcClientId.value = storage.getOidcClientId()
    tokenExpiry.value = storage.getTokenExpiry()

    const hasRefreshToken = !!refreshToken.value
    const hasClientId = !!oidcClientId.value
    if (hasRefreshToken !== hasClientId) {
      clearAuthState()
      return
    }

    const refreshed = await restoreRefreshSchedule()
    if (!refreshed && token.value)
      await fetchSession(token.value)
  }

  async function completeSignIn(tokens: AuthTokenSet): Promise<boolean> {
    token.value = tokens.accessToken
    refreshToken.value = tokens.refreshToken ?? null
    idToken.value = tokens.idToken ?? null
    oidcClientId.value = tokens.clientId
    tokenExpiry.value = Number.isFinite(tokens.expiresIn)
      ? Date.now() + tokens.expiresIn * 1000
      : null
    scheduleTokenRefresh(tokens.expiresIn)
    storage.setAccessToken(token.value)
    storage.setRefreshToken(refreshToken.value)
    storage.setIdToken(idToken.value)
    storage.setOidcClientId(oidcClientId.value)
    storage.setTokenExpiry(tokenExpiry.value)

    return await fetchSession(tokens.accessToken)
  }

  async function fetchSession(accessToken: string | null = token.value): Promise<boolean> {
    const data = await requestAuthSession(accessToken)
    if (data) {
      user.value = data.user
      session.value = data.session
      return true
    }

    clearAuthState()
    return false
  }

  async function listSessions() {
    return await authClient.listSessions({
      fetchOptions: {
        auth: {
          type: 'Bearer',
          token: token.value ?? '',
        },
      },
    })
  }

  /**
   * Rejects when the server sign-out cannot be confirmed; local auth state is
   * retained so callers can surface the failure and retry safely.
   */
  async function signOut(): Promise<void> {
    const idTokenHint = idToken.value
    const clientId = oidcClientId.value
    const bearerToken = token.value

    // Delete the server session before local state. A new authorization request
    // can otherwise reuse the server cookie and restore the previous identity.
    if (idTokenHint && clientId) {
      const url = new URL('/api/auth/oauth2/end-session', SERVER_URL)
      url.searchParams.set('id_token_hint', idTokenHint)
      url.searchParams.set('client_id', clientId)
      const response = await fetch(url.toString(), {
        method: 'GET',
        signal: createSignOutTimeoutSignal(SIGN_OUT_REQUEST_TIMEOUT_MS),
      })
      if (!response.ok)
        throw new Error(`OIDC sign-out failed: HTTP ${response.status}`)
    }
    else if (bearerToken) {
      const url = new URL('/api/auth/sign-out', SERVER_URL)
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: { Authorization: `Bearer ${bearerToken}` },
        signal: createSignOutTimeoutSignal(SIGN_OUT_REQUEST_TIMEOUT_MS),
      })
      if (!response.ok)
        throw new Error(`Bearer sign-out failed: HTTP ${response.status}`)
    }

    clearAuthState()
  }

  /**
   * Reset every auth-related field atomically.
   *
   * Use when: signing out, refresh fails, session is rejected by server, or
   * persisted state is detected inconsistent.
   *
   * Why atomic: `refreshToken` and `oidcClientId` must either both exist or
   * both be absent. A "half-cleared" state (one present, one null) makes
   * `refreshTokenNow()` early-return without attempting refresh, so 401s
   * loop silently until the user lands on a page that calls fetchSession.
   */
  function clearAuthState(): void {
    stopRefreshTimer()
    user.value = null
    session.value = null
    token.value = null
    refreshToken.value = null
    oidcClientId.value = null
    tokenExpiry.value = null
    idToken.value = null
    storage.clear()
  }

  async function clearAllAuthState(): Promise<void> {
    clearAuthState()
  }

  const updateCredits = async () => {
    if (!isAuthenticated.value)
      return
    const res = await client.api.v1.flux.$get()
    if (res.ok) {
      const data = await res.json()
      credits.value = data.flux
    }
  }

  // This is the only watcher that reacts to an auth-state transition. Each
  // window runs its own lifecycle hooks, while persistence remains owned by
  // the auth commands above.
  watch(isAuthenticated, async (authenticated, wasAuthenticated) => {
    if (authenticated) {
      void updateCredits()
      needsLogin.value = false

      if (!wasAuthenticated)
        await dispatchHooks(authenticatedHooks, 'auth hook error')
    }
    else {
      credits.value = 0

      if (wasAuthenticated)
        await dispatchHooks(logoutHooks, 'logout hook error')
    }
  }, { immediate: true })

  async function dispatchHooks(hooks: AuthHook[], errorLabel: string): Promise<void> {
    for (const hook of hooks) {
      try {
        await hook()
      }
      catch (error) {
        console.error(errorLabel, error)
      }
    }
  }

  return {
    user,
    userId,
    session,
    token,
    refreshToken,
    idToken,
    isAuthenticated,
    credits,
    updateCredits,
    needsLogin,
    onAuthenticated,
    onLogout,

    // OIDC token refresh
    oidcClientId,
    tokenExpiry,
    scheduleTokenRefresh,
    initialize,
    completeSignIn,
    fetchSession,
    listSessions,
    signOut,
    refreshTokenNow,
    clearAllAuthState,
  }
}, {
  synced: {
    actions: [
      'initialize',
      'completeSignIn',
      'fetchSession',
      'signOut',
      'refreshTokenNow',
      'clearAllAuthState',
    ],
    state: true,
  },
})
