import type { Ref } from 'vue'

import { onScopeDispose, watch } from 'vue'

/** Limits how long a replicated close request waits for sign-in confirmation. */
const CONFIRMATION_CLOSE_TIMEOUT_MS = 30_000

interface UseOnboardingAuthenticationOptions {
  consumeLoginRequest: () => Promise<boolean>
  closeRequestId: Readonly<Ref<number>>
  closeWindow: () => Promise<unknown>
  isAuthenticated: Readonly<Ref<boolean>>
  isConfirming: Readonly<Ref<boolean>>
  needsLogin: Readonly<Ref<boolean>>
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
  let pendingCloseTimer: ReturnType<typeof setTimeout> | undefined

  /**
   * Closes onboarding after a direct action or a released automatic request. A failed close can be retried.
   *
   * Triggering workflow:
   *
   * `OnboardingScreen` `configured`
   *   -> `handleConfigured` in onboarding.vue
   *     -> {@link closeOnboardingWindow}
   *       -> `electronOnboardingClose` through `options.closeWindow`
   */
  async function closeOnboardingWindow(): Promise<void> {
    closeRequested = true
    if (pendingCloseTimer !== undefined) {
      clearTimeout(pendingCloseTimer)
      pendingCloseTimer = undefined
    }
    if (closing)
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

  /**
   * Defers replicated close requests until sign-in confirmation ends or times out.
   *
   * Triggering workflow:
   *
   * `isAuthenticated`, `closeRequestId`, or `isConfirming`
   *   -> {@link watch}
   *     -> `electronAuthComplete` status or confirmation timeout
   *       -> {@link closeOnboardingWindow}
   */
  watch([options.isAuthenticated, options.closeRequestId, options.isConfirming], ([authenticated, requestId], previous) => {
    const previousRequestId = previous?.[1]
    if (closeRequested || authenticated || (previousRequestId !== undefined && requestId !== previousRequestId)) {
      closeRequested = true
      // Session replication can request closure before the source renderer
      // reports completion to main. Wait for that report before auto-closing.
      if (options.isConfirming.value) {
        pendingCloseTimer ??= setTimeout(() => {
          pendingCloseTimer = undefined
          void closeOnboardingWindow()
        }, CONFIRMATION_CLOSE_TIMEOUT_MS)
      }
      else {
        void closeOnboardingWindow()
      }
    }
  }, { immediate: true })

  onScopeDispose(() => {
    if (pendingCloseTimer !== undefined)
      clearTimeout(pendingCloseTimer)
  })

  // The onboarding window is a separate Electron renderer with its own Pinia
  // instance. It must initiate login itself and stay alive for the token callback.
  watch(options.needsLogin, async (needsLogin) => {
    if (!needsLogin || options.isAuthenticated.value)
      return

    // All login-capable renderers can receive the same snapshot. The leader
    // grants consumption once, before the winning renderer starts its IPC flow.
    if (await options.consumeLoginRequest())
      await options.startLogin()
  })

  return { closeOnboardingWindow }
}
