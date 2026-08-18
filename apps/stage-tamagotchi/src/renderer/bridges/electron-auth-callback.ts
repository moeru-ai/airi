import { errorMessageFrom } from '@moeru/std'
import { getElectronEventaContext } from '@proj-airi/electron-vueuse'
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
      await useAuthStore().completeSignIn({
        ...tokens,
        clientId: import.meta.env.VITE_OIDC_CLIENT_ID || 'airi-stage-electron',
      })
    }
    catch (error) {
      toast.error(errorMessageFrom(error) ?? 'Sign-in failed')
    }
  })

  context.on(electronAuthCallbackError, (event) => {
    if (event.body)
      toast.error(event.body.error)
  })
}
