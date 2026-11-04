import { errorMessageFrom } from '@moeru/std'
import { getHostEventaContext } from '@proj-airi/stage-host-context'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { toast } from 'vue-sonner'

import { desktopAuthConfiguration } from '../shared/auth-config'
import {
  airiAuthCallback,
  airiAuthCallbackError,
} from '../shared/eventa'

/**
 * Register auth callback listeners at the renderer service level so they
 * persist for the window's lifetime, independent of any Vue component's
 * mount/unmount lifecycle.
 */
export function initializeAuthCallbackBridge() {
  const context = getHostEventaContext()

  context.on(airiAuthCallback, async (event) => {
    const tokens = event.body
    if (!tokens)
      return

    try {
      await useAuthStore().completeSignIn({
        ...tokens,
        clientId: desktopAuthConfiguration.clientId,
      })
    }
    catch (error) {
      toast.error(errorMessageFrom(error) ?? 'Sign-in failed')
    }
  })

  context.on(airiAuthCallbackError, (event) => {
    if (event.body)
      toast.error(event.body.error)
  })
}
