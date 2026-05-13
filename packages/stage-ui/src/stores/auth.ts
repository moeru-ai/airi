import type { Session, User } from 'better-auth'

import { isStageTamagotchi } from '@proj-airi/stage-shared'
import { StorageSerializers, useLocalStorage, useTimeoutFn, whenever } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import { client } from '../composables/api'
import { useBreakpoints } from '../composables/use-breakpoints'
import { triggerSignIn } from '../libs/auth'
import { refreshAccessToken } from '../libs/auth-oidc'

/**
 * Auth store — holds identity state and credits.
 *
 * This store has no dependency on `stores/providers`, which allows
 * `providers` to safely depend on it without creating a circular import.
 */
export const useAuthStore = defineStore('auth', () => {
  const user = useLocalStorage<User | null>('auth/v1/user', null, {
    // Why: https://github.com/vueuse/vueuse/pull/614#issuecomment-875450160
    serializer: StorageSerializers.object,
  })
  const session = useLocalStorage<Session | null>('auth/v1/session', null, { serializer: StorageSerializers.object })
  const token = useLocalStorage<string | null>('auth/v1/token', null)
  const refreshToken = useLocalStorage<string | null>('auth/v1/refresh-token', null)
  // NOTICE:
  // Persisted to drive `id_token_hint` on RP-Initiated Logout
  // (`/api/auth/oauth2/end-session`). The `sid` claim inside the ID token is
  // what lets the OIDC provider locate the server-side session row to delete
  // — without this we'd be back to relying on cross-site session cookies.
  const idToken = useLocalStorage<string | null>('auth/v1/oidc-id-token', null)
  const isAuthenticated = computed(() => !!user.value && !!session.value)
  const userId = computed(() => user.value?.id ?? 'local')

  // --- OIDC token refresh state ---
  // Persisted so refresh scheduling survives page reloads.
  const oidcClientId = useLocalStorage<string | null>('auth/v1/oidc-client-id', null)
  const tokenExpiry = useLocalStorage<number | null>('auth/v1/oidc-token-expiry', null)

  const credits = useLocalStorage<number>('user/v1/flux', 0)

  // Cross-app "user must log in" flag. Setting this to true triggers an
  // immediate OIDC redirect on web (mobile + desktop). Electron skips this
  // path because controls-island-auth-button listens for IPC and handles
  // sign-in in the main process.
  const needsLogin = ref(false)
  const { isMobile } = useBreakpoints()

  whenever(needsLogin, async () => {
    if (isStageTamagotchi())
      return
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

  // Dispatch hooks when auth state changes
  watch(isAuthenticated, async (val, oldVal) => {
    if (val && !oldVal) {
      for (const hook of authenticatedHooks) {
        try {
          await hook()
        }
        catch (e) {
          console.error('auth hook error', e)
        }
      }
    }
    if (!val && oldVal) {
      for (const hook of logoutHooks) {
        try {
          await hook()
        }
        catch (e) {
          console.error('logout hook error', e)
        }
      }
    }
  })

  // --- OIDC token refresh scheduling ---
  // Uses useTimeoutFn for automatic cleanup on store teardown.
  // The delay ref is updated by scheduleTokenRefresh before calling start().

  const refreshDelayMs = ref(0)
  type TokenRefreshedHook = (accessToken: string) => void | Promise<void>
  const tokenRefreshedHooks: TokenRefreshedHook[] = []

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
        if (tokens.refresh_token)
          refreshToken.value = tokens.refresh_token
        if (tokens.expires_in) {
          tokenExpiry.value = Date.now() + tokens.expires_in * 1000
          scheduleTokenRefresh(tokens.expires_in)
        }

        for (const hook of tokenRefreshedHooks) {
          try {
            await hook(tokens.access_token)
          }
          catch (e) {
            console.error('token refresh hook error', e)
          }
        }

        return tokens.access_token
      }
      catch {
        clearAllAuthState()
        return null
      }
      finally {
        inflightRefresh = null
      }
    })()

    return inflightRefresh
  }

  const { start: startRefreshTimer, stop: stopRefreshTimer } = useTimeoutFn(
    () => { refreshTokenNow() },
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
  async function restoreRefreshSchedule(): Promise<void> {
    if (!refreshToken.value || !oidcClientId.value)
      return

    if (tokenExpiry.value) {
      const remainingMs = tokenExpiry.value - Date.now()
      if (remainingMs > 0) {
        scheduleTokenRefresh(remainingMs / 1000)
        return
      }
    }

    // Already expired — refresh synchronously so subsequent requests use fresh token
    await refreshTokenNow()
  }

  function onTokenRefreshed(hook: TokenRefreshedHook) {
    tokenRefreshedHooks.push(hook)
    return () => {
      const idx = tokenRefreshedHooks.indexOf(hook)
      if (idx >= 0)
        tokenRefreshedHooks.splice(idx, 1)
    }
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
  function clearAllAuthState(): void {
    stopRefreshTimer()
    user.value = null
    session.value = null
    token.value = null
    refreshToken.value = null
    oidcClientId.value = null
    tokenExpiry.value = null
    idToken.value = null
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

  watch(isAuthenticated, async (val) => {
    if (val) {
      updateCredits()

      needsLogin.value = false
    }
    else {
      credits.value = 0
    }
  }, { immediate: true })

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
    restoreRefreshSchedule,
    refreshTokenNow,
    clearAllAuthState,
    onTokenRefreshed,
  }
})
