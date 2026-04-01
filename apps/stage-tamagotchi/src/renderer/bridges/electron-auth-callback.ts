import { errorMessageFrom } from '@moeru/std'
import { getElectronEventaContext } from '@proj-airi/electron-vueuse'
import { fetchSession } from '@proj-airi/stage-ui/libs/auth'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { toast } from 'vue-sonner'

import {
  electronAuthCallback,
  electronAuthCallbackError,
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

      authStore.oidcClientId = import.meta.env.VITE_OIDC_CLIENT_ID || 'airi-stage-electron'
      authStore.tokenExpiry = Date.now() + tokens.expiresIn * 1000
      authStore.scheduleTokenRefresh(tokens.expiresIn)

      await fetchSession()
    }
    catch (error) {
      toast.error(errorMessageFrom(error) ?? 'Login failed')
    }
  })

  context.on(electronAuthCallbackError, (event) => {
    if (event.body)
      toast.error(event.body.error)
  })
}
