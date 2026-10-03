import type { Ref } from 'vue'

import { computed, watch } from 'vue'

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
  const initialCloseRequestId = options.closeRequestId.value
  const shouldClose = computed(() => options.isAuthenticated.value || options.closeRequestId.value !== initialCloseRequestId)

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
  watch([shouldClose, options.isConfirming], ([requested, confirming], _, onCleanup) => {
    if (!requested)
      return

    if (!confirming) {
      void closeOnboardingWindow()
      return
    }

    // Session replication can request closure before main receives the completion report.
    const timer = setTimeout(() => void closeOnboardingWindow(), CONFIRMATION_CLOSE_TIMEOUT_MS)
    onCleanup(() => clearTimeout(timer))
  }, { immediate: true })

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
