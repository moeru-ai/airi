import type { Ref } from 'vue'

import { onScopeDispose, watch } from 'vue'

interface UseOnboardingWindowPresenterOptions {
  /** The ID of the open onboarding request. Every window sees the same value, because the leader owns the queue. */
  activeRequestId: Readonly<Ref<string | undefined>>
  openWindow: () => Promise<unknown>
  /** Registers a callback for each close of the onboarding window, and returns its removal. */
  onWindowClosed: (callback: () => void) => () => void
  /** Ends a request without records. */
  dismiss: (requestId: string) => Promise<void>
}

/**
 * Opens the desktop onboarding window for each request, one request at a time.
 *
 * State model:
 *
 * - `openedRequestId` is the request that the open window shows. It is empty while no window is open.
 * - A new request opens the window only when no window is open.
 * - When the window closes, a request that is still open counts as closed by the user, and the presenter
 *   dismisses it. A request that the flow finished is already gone. Then the next queued request opens.
 *
 * The main window calls it once. The watcher and the close listener stop with its effect scope.
 */
export function useOnboardingWindowPresenter(options: UseOnboardingWindowPresenterOptions) {
  let openedRequestId: string | undefined

  async function openFor(requestId: string) {
    // The watcher and the close listener can both open the next request.
    if (openedRequestId === requestId)
      return

    openedRequestId = requestId
    await options.openWindow()
  }

  watch(options.activeRequestId, (requestId) => {
    if (requestId && !openedRequestId)
      void openFor(requestId)
  }, { immediate: true })

  const stopListening = options.onWindowClosed(() => {
    const closedRequestId = openedRequestId
    openedRequestId = undefined

    void (async () => {
      if (closedRequestId && options.activeRequestId.value === closedRequestId)
        await options.dismiss(closedRequestId)
      if (options.activeRequestId.value)
        await openFor(options.activeRequestId.value)
    })()
  })
  onScopeDispose(stopListening)
}
