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
  const loads = new Map<string, ReturnType<typeof deferred>>()
  const applyProviderState = vi.fn()
  const clearSegments = vi.fn()
  const loadModels = vi.fn((provider: string) => {
    const pendingLoad = deferred()
    loads.set(provider, pendingLoad)
    return pendingLoad.promise
  })
  const startMonitoring = vi.fn().mockResolvedValue(true)
  const stopMonitoring = vi.fn().mockResolvedValue(undefined)
  const controller = createProviderTransitionController({
    applyProviderState,
    clearSegments,
    getActiveProvider: () => activeProvider,
    getMonitoring: () => monitoring,
    loadModels,
    setMonitoring: value => monitoring = value,
    shouldLoadModels: () => true,
    startMonitoring,
    stopMonitoring,
  })

  return {
    applyProviderState,
    controller,
    getMonitoring: () => monitoring,
    loadModels,
    loads,
    setActiveProvider: (provider: string) => activeProvider = provider,
    startMonitoring,
    stopMonitoring,
  }
}

describe('provider transition controller', () => {
  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3809925340
  it('restarts monitoring for the latest provider after A to B to C', async () => {
    const harness = createHarness('B')
    const transition = harness.controller.requestTransition('A')
    await vi.waitFor(() => expect(harness.loadModels).toHaveBeenCalledWith('B'))

    harness.setActiveProvider('C')
    harness.controller.requestTransition('B')
    harness.loads.get('B')!.resolve()
    await vi.waitFor(() => expect(harness.loadModels).toHaveBeenCalledWith('C'))
    harness.loads.get('C')!.resolve()
    await transition

    // ROOT CAUSE: Each watcher invocation owned a local restart flag, so the
    // latest transition could forget that an older transition stopped monitoring.
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
    await vi.waitFor(() => expect(harness.loadModels).toHaveBeenCalledWith('B'))

    harness.setActiveProvider('A')
    harness.controller.requestTransition('B')
    harness.loads.get('B')!.resolve()
    await vi.waitFor(() => expect(harness.loadModels).toHaveBeenCalledWith('A'))
    harness.loads.get('A')!.resolve()
    await transition

    // ROOT CAUSE: Comparing provider ids cannot distinguish two separate A
    // transitions when an asynchronous B transition runs between them.
    expect(harness.applyProviderState).toHaveBeenCalledTimes(1)
    expect(harness.applyProviderState).toHaveBeenCalledWith('A')
    expect(harness.startMonitoring).toHaveBeenCalledTimes(1)
    expect(harness.getMonitoring()).toBe(true)
  })
})
