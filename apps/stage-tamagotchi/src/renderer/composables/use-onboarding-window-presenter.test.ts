import { describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, shallowRef } from 'vue'

import { useOnboardingWindowPresenter } from './use-onboarding-window-presenter'

function setup(initialRequestId?: string) {
  const activeRequestId = shallowRef<string | undefined>(initialRequestId)
  const openWindow = vi.fn<() => Promise<void>>().mockResolvedValue()
  const closeListeners = new Set<() => void>()
  // The leader ends the request synchronously, as the stage window is the leader.
  const dismiss = vi.fn<(requestId: string) => Promise<void>>(async (requestId) => {
    if (activeRequestId.value === requestId)
      activeRequestId.value = undefined
  })
  const scope = effectScope()
  scope.run(() => useOnboardingWindowPresenter({
    activeRequestId,
    openWindow,
    onWindowClosed: (callback) => {
      closeListeners.add(callback)
      return () => closeListeners.delete(callback)
    },
    dismiss,
  }))

  return {
    activeRequestId,
    openWindow,
    dismiss,
    scope,
    closeWindow: async () => {
      closeListeners.forEach(callback => callback())
      // The close listener runs its dismiss and reopen in a detached promise.
      await new Promise(resolve => setTimeout(resolve, 0))
    },
    closeListeners,
  }
}

describe('useOnboardingWindowPresenter', () => {
  it('opens the window for the request that is open at startup', () => {
    const presenter = setup('startup')

    expect(presenter.openWindow).toHaveBeenCalledTimes(1)
  })

  it('dismisses the request when the user closes the window', async () => {
    const presenter = setup('startup')

    await presenter.closeWindow()

    expect(presenter.dismiss).toHaveBeenCalledWith('startup')
    expect(presenter.activeRequestId.value).toBeUndefined()
  })

  it('does not dismiss a request that the flow finished, and opens the next request after the close', async () => {
    const presenter = setup('first')

    // The flow finishes the first request. The queued request becomes active while the window still closes.
    presenter.activeRequestId.value = 'second'
    await nextTick()
    expect(presenter.openWindow).toHaveBeenCalledTimes(1)

    await presenter.closeWindow()

    expect(presenter.dismiss).not.toHaveBeenCalled()
    expect(presenter.openWindow).toHaveBeenCalledTimes(2)
  })

  it('opens the window once for a request that arrives while no window is open', async () => {
    const presenter = setup()

    presenter.activeRequestId.value = 'from-settings'
    await nextTick()

    expect(presenter.openWindow).toHaveBeenCalledTimes(1)
  })

  it('stops listening for closes when its scope stops', () => {
    const presenter = setup('startup')

    presenter.scope.stop()

    expect(presenter.closeListeners.size).toBe(0)
  })
})
