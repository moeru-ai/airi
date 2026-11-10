import { defineInvoke } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { getElectronEventaContext } from '@proj-airi/electron-vueuse'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { toast } from 'vue-sonner'

import {
  electronAuthCallback,
  electronAuthCallbackError,
  electronAuthComplete,
  electronAuthGetStatus,
  electronAuthStatus,
} from '../../shared/eventa'
import { i18n } from '../modules/i18n'
import { useAuthStatusStore } from '../stores/auth-status'

/**
 * Register auth callback listeners at the renderer service level so they
 * persist for the window's lifetime, independent of any Vue component's
 * mount/unmount lifecycle.
 */
export function initializeElectronAuthCallbackBridge() {
  const context = getElectronEventaContext()
  const feedback = useAuthStatusStore()
  const complete = defineInvoke(context, electronAuthComplete)
  context.on(electronAuthStatus, (event) => {
    if (event.body)
      feedback.status = event.body
  })
  // Subscribe first so initial hydration cannot replace a newer live event.
  void defineInvoke(context, electronAuthGetStatus)().then((status) => {
    if (!feedback.status)
      feedback.status = status
  }).catch(() => {})

  context.on(electronAuthCallback, async (event) => {
    const tokens = event.body
    if (!tokens)
      return

    const { attemptId, ...credentials } = tokens
    let failure: string | undefined
    try {
      const confirmed = await useAuthStore().completeSignIn({
        ...credentials,
        clientId: import.meta.env.VITE_OIDC_CLIENT_ID || 'airi-stage-electron',
      })
      if (!confirmed)
        failure = i18n.global.t('stage.status.sign-in-unconfirmed')
    }
    catch (error) {
      failure = errorMessageFrom(error) ?? 'Sign-in failed'
    }

    try {
      await complete({ attemptId, error: failure })
    }
    catch (error) {
      // The callback renderer still needs feedback if its main-process report
      // cannot be delivered. Do not run session confirmation a second time.
      failure = errorMessageFrom(error) ?? 'Could not report sign-in status'
      feedback.status = { attemptId, state: 'error', error: failure }
    }
    if (failure)
      toast.error(failure)
  })

  context.on(electronAuthCallbackError, (event) => {
    if (event.body)
      toast.error(event.body.error)
  })
}
