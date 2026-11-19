import { useElectronEventaContext, useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { useAnalytics } from '@proj-airi/stage-ui/composables/use-analytics'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { storeToRefs } from 'pinia'
import { onScopeDispose, readonly, ref, watch } from 'vue'

import { electronAuthCallback, electronAuthCallbackError, electronAuthStartLogin } from '../../../../shared/eventa'

/**
 * Owns the sign-in of the main window: the sign-in item of the app menu, and a sign-in that another surface asks for.
 *
 * The main process returns the token callback only to the window that started sign-in, and the main window registers
 * the callback bridge. So sign-in starts here, not in the menu window. `signingIn` stays on until the callback, its
 * error, or the signed-in account.
 */
export function useControlsIslandSignIn() {
  const context = useElectronEventaContext()
  const { trackControlsIslandAction } = useAnalytics()
  const startSigningIn = useElectronEventaInvoke(electronAuthStartLogin)
  const authStore = useAuthStore()
  const { isAuthenticated, needsLogin } = storeToRefs(authStore)
  const signingIn = ref(false)

  function signIn() {
    signingIn.value = true
    trackControlsIslandAction({ action: 'sign_in' })
    startSigningIn()
  }

  const stopCallback = context.value.on(electronAuthCallback, () => {
    signingIn.value = false
  })
  const stopError = context.value.on(electronAuthCallbackError, () => {
    signingIn.value = false
  })
  onScopeDispose(() => {
    stopCallback()
    stopError()
  })
  watch(isAuthenticated, (authenticated) => {
    if (authenticated)
      signingIn.value = false
  })
  // Another surface can ask for a sign-in, for example a chat that needs the official provider.
  watch(needsLogin, async (requested) => {
    if (requested && !isAuthenticated.value && await authStore.consumeLoginRequest())
      signIn()
  }, { immediate: true })

  return { signingIn: readonly(signingIn), signIn }
}
