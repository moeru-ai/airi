import { describe, expect, it, vi } from 'vitest'

import { createProviderTransitionController } from './provider-transition'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function createHarness(initialProvider: string) {
  let activeProvider: string | undefined = initialProvider
  let monitoring = true
  const readinessTasks = new Map<string, ReturnType<typeof deferred>>()
  const applyProviderState = vi.fn()
  const clearSegments = vi.fn()
  const waitForProviderReady = vi.fn((provider: string) => {
    const readinessTask = deferred()
    readinessTasks.set(provider, readinessTask)
    return readinessTask.promise
  })
  const startMonitoring = vi.fn().mockResolvedValue(true)
  const stopMonitoring = vi.fn().mockResolvedValue(undefined)
  const controller = createProviderTransitionController({
    applyProviderState,
    clearSegments,
    getActiveProvider: () => activeProvider,
    getMonitoring: () => monitoring,
    setMonitoring: value => monitoring = value,
    startMonitoring,
    stopMonitoring,
    waitForProviderReady,
  })

  return {
    applyProviderState,
    controller,
    getMonitoring: () => monitoring,
    readinessTasks,
    setActiveProvider: (provider: string) => activeProvider = provider,
    startMonitoring,
    stopMonitoring,
    waitForProviderReady,
  }
}

describe('provider transition controller', () => {
  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3827031092
  it('waits for provider readiness before it restarts monitoring (GitHub #2122)', async () => {
    const harness = createHarness('B')
    const transition = harness.controller.requestTransition('A')

    // ROOT CAUSE:
    //
    // The settings page disabled the readiness hook. The controller restarted monitoring before
    // the provider-selection action resolved its destination model.
    await vi.waitFor(() => expect(harness.waitForProviderReady).toHaveBeenCalledWith('B'))
    expect(harness.startMonitoring).not.toHaveBeenCalled()

    harness.readinessTasks.get('B')!.resolve()
    await transition

    expect(harness.startMonitoring).toHaveBeenCalledTimes(1)
    expect(harness.getMonitoring()).toBe(true)
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3842674728
  it('does not restart monitoring after controller disposal (GitHub #2122)', async () => {
    const harness = createHarness('B')
    const transition = harness.controller.requestTransition('A')
    await vi.waitFor(() => expect(harness.waitForProviderReady).toHaveBeenCalledWith('B'))

    harness.controller.dispose()
    harness.readinessTasks.get('B')!.resolve()
    await transition

    // ROOT CAUSE:
    //
    // The page cleanup stopped the current microphone session, but the pending provider
    // transition still owned permission to restart it after provider readiness resolved.
    expect(harness.applyProviderState).not.toHaveBeenCalled()
    expect(harness.startMonitoring).not.toHaveBeenCalled()
    expect(harness.getMonitoring()).toBe(false)
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3842674728
  it('stops monitoring when setup completes after controller disposal (GitHub #2122)', async () => {
    const harness = createHarness('B')
    const startTask = deferred()
    harness.startMonitoring.mockReturnValueOnce(startTask.promise.then(() => true))
    const transition = harness.controller.requestTransition('A')
    await vi.waitFor(() => expect(harness.waitForProviderReady).toHaveBeenCalledWith('B'))

    harness.readinessTasks.get('B')!.resolve()
    await vi.waitFor(() => expect(harness.startMonitoring).toHaveBeenCalledTimes(1))
    harness.controller.dispose()
    startTask.resolve()
    await transition

    // ROOT CAUSE: Setup could finish after page cleanup and create a new microphone session
    // unless the disposed transition releases the provider session that it just started.
    expect(harness.stopMonitoring).toHaveBeenCalledTimes(2)
    expect(harness.stopMonitoring).toHaveBeenLastCalledWith('B')
    expect(harness.getMonitoring()).toBe(false)
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3809925340
  it('restarts monitoring for the latest provider after A to B to C', async () => {
    const harness = createHarness('B')
    const transition = harness.controller.requestTransition('A')
    await vi.waitFor(() => expect(harness.waitForProviderReady).toHaveBeenCalledWith('B'))

    harness.setActiveProvider('C')
    harness.controller.requestTransition('B')
    await vi.waitFor(() => expect(harness.waitForProviderReady).toHaveBeenCalledWith('C'))
    harness.readinessTasks.get('C')!.resolve()
    await transition

    // ROOT CAUSE: Each watcher invocation owned a local restart flag, and the
    // transition could not leave an older readiness wait until that provider resolved.
    expect(harness.stopMonitoring).toHaveBeenCalledTimes(1)
    expect(harness.applyProviderState).toHaveBeenCalledTimes(1)
    expect(harness.applyProviderState).toHaveBeenCalledWith('C')
    expect(harness.startMonitoring).toHaveBeenCalledTimes(1)
    expect(harness.getMonitoring()).toBe(true)
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3809925340
  it('uses transition ownership when the provider changes A to B to A', async () => {
    const harness = createHarness('B')
    const transition = harness.controller.requestTransition('A')
    await vi.waitFor(() => expect(harness.waitForProviderReady).toHaveBeenCalledWith('B'))

    harness.setActiveProvider('A')
    harness.controller.requestTransition('B')
    harness.readinessTasks.get('B')!.resolve()
    await vi.waitFor(() => expect(harness.waitForProviderReady).toHaveBeenCalledWith('A'))
    harness.readinessTasks.get('A')!.resolve()
    await transition

    // ROOT CAUSE: Comparing provider ids cannot distinguish two separate A
    // transitions when an asynchronous B transition runs between them.
    expect(harness.applyProviderState).toHaveBeenCalledTimes(1)
    expect(harness.applyProviderState).toHaveBeenCalledWith('A')
    expect(harness.startMonitoring).toHaveBeenCalledTimes(1)
    expect(harness.getMonitoring()).toBe(true)
  })
})
