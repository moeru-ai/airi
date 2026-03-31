import { errorMessageFrom } from '@moeru/std'
import { getElectronEventaContext } from '@proj-airi/electron-vueuse'
import { exchangeOIDCTokenForSession, fetchSession } from '@proj-airi/stage-ui/libs/auth'
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
      // Exchange OIDC access token for a better-auth session token.
      // The OIDC token is passed directly — never written to authStore.token.
      await exchangeOIDCTokenForSession(tokens.accessToken)

      // Store the OIDC refresh token for future token renewal (deferred follow-up).
      if (tokens.refreshToken) {
        useAuthStore().refreshToken = tokens.refreshToken
      }

      // Fetch full session/user data from server using the new session token.
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
