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
  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3888398390
  it('stages config and model before separately awaiting guarded persistence (GitHub #2122)', async () => {
    const disposeProviderInstance = vi.fn().mockResolvedValue(undefined)
    const stageTranscriptionProviderConfig = vi.fn().mockResolvedValue(undefined)
    const persistProviderConfigIfCurrent = vi.fn().mockResolvedValue(undefined)
    await commitProviderConfigEdit({
      config: { baseUrl: 'http://localhost:8000/v1/', model: 'sensevoice' },
      providerId: 'provider-a',
      status: 'configured',
    }, {
      stageTranscriptionProviderConfig,
      persistProviderConfigIfCurrent,
      disposeProviderInstance,
    })

    // ROOT CAUSE:
    //
    // Config and model publication is one short leader-owned action. Persistence is guarded
    // separately so a slow request cannot cause the staging action to replay after handoff.
    expect(stageTranscriptionProviderConfig).toHaveBeenCalledWith(
      'provider-a',
      { baseUrl: 'http://localhost:8000/v1/', model: 'sensevoice' },
      'configured',
      expect.any(String),
    )
    expect(persistProviderConfigIfCurrent).toHaveBeenCalledWith(
      'provider-a',
      { baseUrl: 'http://localhost:8000/v1/', model: 'sensevoice' },
      'configured',
      stageTranscriptionProviderConfig.mock.calls[0]?.[3],
    )
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3844802489
  it('keeps the config and model on the provider that started the save (GitHub #2122)', async () => {
    let routeProviderId = 'provider-a'
    const configWrite = deferred()
    const disposeProviderInstance = vi.fn().mockResolvedValue(undefined)
    const stageTranscriptionProviderConfig = vi.fn().mockResolvedValue(undefined)
    const persistProviderConfigIfCurrent = vi.fn(async () => configWrite.promise)
    const commit = commitProviderConfigEdit({
      config: { model: 'sensevoice' },
      providerId: routeProviderId,
      status: 'configured',
    }, {
      stageTranscriptionProviderConfig,
      persistProviderConfigIfCurrent,
      disposeProviderInstance,
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
    expect(disposeProviderInstance.mock.invocationCallOrder[0]).toBeLessThan(stageTranscriptionProviderConfig.mock.invocationCallOrder[0])
    expect(stageTranscriptionProviderConfig).toHaveBeenCalledWith('provider-a', { model: 'sensevoice' }, 'configured', expect.any(String))
    expect(persistProviderConfigIfCurrent).toHaveBeenCalledWith(
      'provider-a',
      { model: 'sensevoice' },
      'configured',
      stageTranscriptionProviderConfig.mock.calls[0]?.[3],
    )
  })
})
