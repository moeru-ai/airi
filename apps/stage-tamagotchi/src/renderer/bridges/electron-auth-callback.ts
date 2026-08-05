import { errorMessageFrom } from '@moeru/std'
import { getElectronEventaContext, useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { oidcClientId } from '@proj-airi/stage-shared/auth'
import { fetchSession, getAuthToken } from '@proj-airi/stage-ui/libs/auth'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { toast } from 'vue-sonner'

import {
  electronAuthCallback,
  electronAuthCallbackError,
  electronAuthSessionState,
} from '../../shared/eventa'

/**
 * Register auth callback listeners at the renderer service level so they
 * persist for the window's lifetime, independent of any Vue component's
 * mount/unmount lifecycle.
 */
export function initializeElectronAuthCallbackBridge() {
  const context = getElectronEventaContext()

  context.on(electronAuthCallback, async (event) => {
    const tokens = event.body
    if (!tokens)
      return

    try {
      const authStore = useAuthStore()
      authStore.token = tokens.accessToken

      if (tokens.refreshToken) {
        authStore.refreshToken = tokens.refreshToken
      }

      if (tokens.idToken) {
        authStore.idToken = tokens.idToken
      }

      authStore.oidcClientId = oidcClientId
      authStore.tokenExpiry = Date.now() + tokens.expiresIn * 1000
      authStore.scheduleTokenRefresh(tokens.expiresIn)

      await fetchSession()
    }
    catch (error) {
      toast.error(errorMessageFrom(error) ?? 'Sign-in failed')
    }
  })

  context.on(electronAuthCallbackError, (event) => {
    if (event.body)
      toast.error(event.body.error)
  })

  // Report whether a session was already persisted so the main process can
  // skip the silent Steam ticket sign-in instead of overwriting the user's
  // current account with a Steam-created one at startup.
  const reportSessionState = useElectronEventaInvoke(electronAuthSessionState, context)
  void reportSessionState({ hasSession: !!getAuthToken() })
}
