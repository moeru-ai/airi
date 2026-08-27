import { describe, expect, it, vi } from 'vitest'

import { commitProviderConfigEdit } from './provider-config-commit'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('provider config commit', () => {
  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3844802489
  it('keeps the config and model on the provider that started the save (GitHub #2122)', async () => {
    let routeProviderId = 'provider-a'
    const configWrite = deferred()
    const disposeProviderInstance = vi.fn().mockResolvedValue(undefined)
    const updateProviderConfig = vi.fn(async () => configWrite.promise)
    const setTranscriptionModelForProvider = vi.fn().mockResolvedValue(undefined)
    const commit = commitProviderConfigEdit({
      config: { model: 'sensevoice' },
      providerId: routeProviderId,
      status: 'configured',
    }, {
      disposeProviderInstance,
      setTranscriptionModelForProvider,
      updateProviderConfig,
    })

    routeProviderId = 'provider-b'
    configWrite.resolve()
    await commit

    // ROOT CAUSE:
    //
    // The page read the reactive route ID again after the config write. A route change during
    // the write could save the captured model on the next provider.
    expect(routeProviderId).toBe('provider-b')
    expect(disposeProviderInstance).toHaveBeenCalledWith('provider-a')
    expect(disposeProviderInstance.mock.invocationCallOrder[0]).toBeLessThan(updateProviderConfig.mock.invocationCallOrder[0])
    expect(updateProviderConfig).toHaveBeenCalledWith('provider-a', { model: 'sensevoice' }, 'configured')
    expect(setTranscriptionModelForProvider).toHaveBeenCalledWith('provider-a', 'sensevoice')
  })
})
