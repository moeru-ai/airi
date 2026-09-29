import { describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, shallowRef } from 'vue'

import { useOnboardingAuthentication } from './use-onboarding-authentication'

describe('useOnboardingAuthentication', () => {
  it('keeps the initiating window open until the first sign-in completes', async () => {
    const isAuthenticated = shallowRef(false)
    const needsLogin = shallowRef(false)
    const closeRequestId = shallowRef(0)
    const startLogin = vi.fn<() => Promise<void>>().mockResolvedValue()
    const closeWindow = vi.fn<() => Promise<void>>().mockResolvedValue()
    const scope = effectScope()

    // ROOT CAUSE:
    //
    // The onboarding window closed as soon as the main process opened the browser.
    // The main process later sent the token callback to that closed renderer, so the first sign-in was lost.
    // The window must stay open until synchronized authentication state confirms the completed sign-in.
    scope.run(() => useOnboardingAuthentication({
      consumeLoginRequest: async () => {
        needsLogin.value = false
        return true
      },
      closeRequestId,
      closeWindow,
      isAuthenticated,
      isConfirming: shallowRef(false),
      needsLogin,
      onCloseError: vi.fn(),
      startLogin,
    }))

    needsLogin.value = true
    await nextTick()
    await Promise.resolve()

    expect(startLogin).toHaveBeenCalledTimes(1)
    expect(needsLogin.value).toBe(false)
    expect(closeWindow).not.toHaveBeenCalled()

    isAuthenticated.value = true
    await nextTick()

    expect(closeWindow).toHaveBeenCalledTimes(1)
    scope.stop()
  })

  it('closes when another renderer publishes a close request', async () => {
    const closeRequestId = shallowRef(0)
    const closeWindow = vi.fn<() => Promise<void>>().mockResolvedValue()
    const scope = effectScope()

    scope.run(() => useOnboardingAuthentication({
      consumeLoginRequest: vi.fn().mockResolvedValue(false),
      closeRequestId,
      closeWindow,
      isAuthenticated: shallowRef(false),
      isConfirming: shallowRef(false),
      needsLogin: shallowRef(false),
      onCloseError: vi.fn(),
      startLogin: vi.fn<() => Promise<void>>().mockResolvedValue(),
    }))

    closeRequestId.value += 1
    await nextTick()

    expect(closeWindow).toHaveBeenCalledTimes(1)
    scope.stop()
  })

  it('allows a close retry after Electron rejects the first request', async () => {
    const closeWindow = vi.fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('window unavailable'))
      .mockResolvedValue()
    const onCloseError = vi.fn()
    const scope = effectScope()
    const controls = scope.run(() => useOnboardingAuthentication({
      consumeLoginRequest: vi.fn().mockResolvedValue(false),
      closeRequestId: shallowRef(0),
      closeWindow,
      isAuthenticated: shallowRef(false),
      isConfirming: shallowRef(false),
      needsLogin: shallowRef(false),
      onCloseError,
      startLogin: vi.fn<() => Promise<void>>().mockResolvedValue(),
    }))

    await controls!.closeOnboardingWindow()
    await controls!.closeOnboardingWindow()

    expect(closeWindow).toHaveBeenCalledTimes(2)
    expect(onCloseError).toHaveBeenCalledTimes(1)
    scope.stop()
  })

  it('closes after an explicit action while sign-in confirmation is pending', async () => {
    const closeWindow = vi.fn<() => Promise<void>>().mockResolvedValue()
    const scope = effectScope()
    const controls = scope.run(() => useOnboardingAuthentication({
      consumeLoginRequest: vi.fn().mockResolvedValue(false),
      closeRequestId: shallowRef(0),
      closeWindow,
      isAuthenticated: shallowRef(false),
      isConfirming: shallowRef(true),
      needsLogin: shallowRef(false),
      onCloseError: vi.fn(),
      startLogin: vi.fn<() => Promise<void>>().mockResolvedValue(),
    }))

    await controls!.closeOnboardingWindow()

    expect(closeWindow).toHaveBeenCalledTimes(1)
    scope.stop()
  })

  it('closes after a bounded wait when a replicated close request remains pending', async () => {
    vi.useFakeTimers()
    try {
      const closeRequestId = shallowRef(0)
      const closeWindow = vi.fn<() => Promise<void>>().mockResolvedValue()
      const scope = effectScope()
      scope.run(() => useOnboardingAuthentication({
        consumeLoginRequest: vi.fn().mockResolvedValue(false),
        closeRequestId,
        closeWindow,
        isAuthenticated: shallowRef(false),
        isConfirming: shallowRef(true),
        needsLogin: shallowRef(false),
        onCloseError: vi.fn(),
        startLogin: vi.fn<() => Promise<void>>().mockResolvedValue(),
      }))

      closeRequestId.value++
      await nextTick()
      expect(closeWindow).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(15_000)
      closeRequestId.value++
      await nextTick()
      await vi.advanceTimersByTimeAsync(15_000)
      expect(closeWindow).toHaveBeenCalledTimes(1)
      scope.stop()
    }
    finally {
      vi.useRealTimers()
    }
  })
})

it('keeps the callback renderer alive until its completion report is acknowledged', async () => {
  // ROOT CAUSE:
  // Session replication closed onboarding before electronAuthComplete reached
  // main, turning a successful sign-in into an error on window destruction.
  const isAuthenticated = shallowRef(false)
  const isConfirming = shallowRef(true)
  const closeRequestId = shallowRef(0)
  const closeWindow = vi.fn<() => Promise<void>>().mockResolvedValue()
  const scope = effectScope()
  scope.run(() => useOnboardingAuthentication({
    consumeLoginRequest: vi.fn().mockResolvedValue(false),
    closeRequestId,
    closeWindow,
    isAuthenticated,
    isConfirming,
    needsLogin: shallowRef(false),
    onCloseError: vi.fn(),
    startLogin: vi.fn<() => Promise<void>>().mockResolvedValue(),
  }))
  isAuthenticated.value = true
  closeRequestId.value++
  await nextTick()
  expect(closeWindow).not.toHaveBeenCalled()
  isConfirming.value = false
  await nextTick()
  expect(closeWindow).toHaveBeenCalledTimes(1)
  scope.stop()
})
