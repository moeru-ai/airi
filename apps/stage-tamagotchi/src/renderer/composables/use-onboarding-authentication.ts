import type { Ref } from 'vue'

import { watch } from 'vue'

interface UseOnboardingAuthenticationOptions {
  closeRequestId: Readonly<Ref<number>>
  closeWindow: () => Promise<unknown>
  isAuthenticated: Readonly<Ref<boolean>>
  isConfirming: Readonly<Ref<boolean>>
  needsLogin: Ref<boolean>
  onCloseError: (error: unknown) => void
  startLogin: () => Promise<void>
}

interface OnboardingAuthenticationControls {
  closeOnboardingWindow: () => Promise<void>
}

/**
 * Coordinates sign-in and window closure for the standalone onboarding renderer.
 *
 * The renderer that starts the external sign-in remains alive until synchronized
 * authentication state confirms completion and main acknowledges the status report.
 * Close requests are deduplicated while
 * the Electron close operation is in flight.
 */
export function useOnboardingAuthentication(options: UseOnboardingAuthenticationOptions): OnboardingAuthenticationControls {
  let closing = false
  let closeRequested = false

  /** Closes the onboarding window once and permits a retry after a failed close. */
  async function closeOnboardingWindow(): Promise<void> {
    closeRequested = true
    // Session replication can request closure before the source renderer reports
    // success to main. Keep that renderer alive until the report is acknowledged.
    if (closing || options.isConfirming.value)
      return

    closing = true
    try {
      await options.closeWindow()
    }
    catch (error) {
      closing = false
      options.onCloseError(error)
    }
  }

  // The shared action publishes a close request from the renderer that finishes
  // authentication. This renderer remains the sole owner of the Electron close
  // side effect. The auth check also handles a window mounted after the request.
  watch([options.isAuthenticated, options.closeRequestId, options.isConfirming], ([authenticated, requestId], previous) => {
    const previousRequestId = previous?.[1]
    if (closeRequested || authenticated || (previousRequestId !== undefined && requestId !== previousRequestId))
      void closeOnboardingWindow()
  }, { immediate: true })

  // The onboarding window is a separate Electron renderer with its own Pinia
  // instance. It must initiate login itself and stay alive for the token callback.
  watch(options.needsLogin, async (needsLogin) => {
    if (!needsLogin || options.isAuthenticated.value)
      return

    await options.startLogin()
    options.needsLogin.value = false
  })

  return { closeOnboardingWindow }
}
