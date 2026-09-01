import { afterEach, describe, expect, it, vi } from 'vitest'

import { commitProviderConfigEdit } from './provider-config-commit'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('provider config commit', () => {
  afterEach(() => vi.restoreAllMocks())

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3888398390
  it('stages config and model before separately awaiting guarded persistence (GitHub #2122)', async () => {
    const disposeProviderInstance = vi.fn().mockResolvedValue(undefined)
    const loadModelsForProvider = vi.fn().mockResolvedValue([])
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
      loadModelsForProvider,
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

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3900572905
  it('claims save ownership before waiting for provider disposal (GitHub #2122)', async () => {
    const disposal = deferred()
    const disposeProviderInstance = vi.fn(async () => disposal.promise)
    const loadModelsForProvider = vi.fn().mockResolvedValue([])
    const stageTranscriptionProviderConfig = vi.fn().mockResolvedValue(undefined)
    const persistProviderConfigIfCurrent = vi.fn().mockResolvedValue(undefined)
    const commit = commitProviderConfigEdit({
      config: { model: 'sensevoice' },
      providerId: 'provider-a',
      status: 'configured',
    }, {
      disposeProviderInstance,
      loadModelsForProvider,
      persistProviderConfigIfCurrent,
      stageTranscriptionProviderConfig,
    })

    await vi.waitFor(() => expect(disposeProviderInstance).toHaveBeenCalledOnce())
    const stagedBeforeDisposalFinished = stageTranscriptionProviderConfig.mock.calls.length
    disposal.resolve()
    await commit

    // ROOT CAUSE:
    //
    // A save claimed commit ownership only after asynchronous disposal. An older save could
    // resume after a newer save and replace its ownership, configuration, and persistence.
    expect(stagedBeforeDisposalFinished).toBe(1)
    expect(stageTranscriptionProviderConfig.mock.invocationCallOrder[0])
      .toBeLessThan(disposeProviderInstance.mock.invocationCallOrder[0])
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3900572905
  it('persists staged config when provider disposal fails (GitHub #2122)', async () => {
    const disposalError = new Error('dispose failed')
    const disposeProviderInstance = vi.fn().mockRejectedValue(disposalError)
    const loadModelsForProvider = vi.fn().mockResolvedValue([])
    const stageTranscriptionProviderConfig = vi.fn().mockResolvedValue(undefined)
    const persistProviderConfigIfCurrent = vi.fn().mockResolvedValue(undefined)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(commitProviderConfigEdit({
      config: { model: 'sensevoice' },
      providerId: 'provider-a',
      status: 'configured',
    }, {
      disposeProviderInstance,
      loadModelsForProvider,
      persistProviderConfigIfCurrent,
      stageTranscriptionProviderConfig,
    })).resolves.toBeUndefined()

    // ROOT CAUSE:
    //
    // Disposal ran after synchronized config staging. A cleanup rejection stopped guarded
    // persistence and left the backend on the previous config.
    expect(persistProviderConfigIfCurrent).toHaveBeenCalledOnce()
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to dispose provider instance after saving provider config:',
      disposalError,
    )
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3844802489
  it('keeps the config and model on the provider that started the save (GitHub #2122)', async () => {
    let routeProviderId = 'provider-a'
    const configWrite = deferred()
    const disposeProviderInstance = vi.fn().mockResolvedValue(undefined)
    const loadModelsForProvider = vi.fn().mockResolvedValue([])
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
      loadModelsForProvider,
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
    expect(stageTranscriptionProviderConfig.mock.invocationCallOrder[0]).toBeLessThan(disposeProviderInstance.mock.invocationCallOrder[0])
    expect(stageTranscriptionProviderConfig).toHaveBeenCalledWith('provider-a', { model: 'sensevoice' }, 'configured', expect.any(String))
    expect(persistProviderConfigIfCurrent).toHaveBeenCalledWith(
      'provider-a',
      { model: 'sensevoice' },
      'configured',
      stageTranscriptionProviderConfig.mock.calls[0]?.[3],
    )
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3891641795
  it('refreshes the saved provider model catalog after staging config (GitHub #2122)', async () => {
    const configStage = deferred()
    const modelRefresh = deferred()
    const disposeProviderInstance = vi.fn().mockResolvedValue(undefined)
    const loadModelsForProvider = vi.fn(async () => modelRefresh.promise)
    const stageTranscriptionProviderConfig = vi.fn(async () => {
      await configStage.promise
      return undefined
    })
    const persistProviderConfigIfCurrent = vi.fn().mockResolvedValue(undefined)
    const dependencies = {
      disposeProviderInstance,
      loadModelsForProvider,
      persistProviderConfigIfCurrent,
      stageTranscriptionProviderConfig,
    }

    const commit = commitProviderConfigEdit({
      config: { baseUrl: 'http://localhost:8000/v1/', model: 'sensevoice' },
      providerId: 'provider-a',
      status: 'configured',
    }, dependencies)

    await vi.waitFor(() => expect(stageTranscriptionProviderConfig).toHaveBeenCalledOnce())
    expect(loadModelsForProvider).not.toHaveBeenCalled()
    configStage.resolve()
    await vi.waitFor(() => expect(loadModelsForProvider).toHaveBeenCalledWith('provider-a'))
    const persistedBeforeRefreshFinished = persistProviderConfigIfCurrent.mock.calls.length
    modelRefresh.resolve()
    await commit

    // ROOT CAUSE:
    //
    // Saving staged new credentials but left the old model-list request as the latest owner.
    // A refresh must start after staging to get a newer request ID, but model discovery must
    // not delay persistence because the provider endpoint can stall.
    expect(persistedBeforeRefreshFinished).toBe(1)
    expect(loadModelsForProvider).toHaveBeenCalledWith('provider-a')
    expect(stageTranscriptionProviderConfig.mock.invocationCallOrder[0])
      .toBeLessThan(disposeProviderInstance.mock.invocationCallOrder[0])
    expect(disposeProviderInstance.mock.invocationCallOrder[0])
      .toBeLessThan(loadModelsForProvider.mock.invocationCallOrder[0])
    expect(loadModelsForProvider.mock.invocationCallOrder[0])
      .toBeLessThan(persistProviderConfigIfCurrent.mock.invocationCallOrder[0])
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3900572911
  it('observes a background model refresh failure without failing the save (GitHub #2122)', async () => {
    const refreshError = new Error('refresh failed')
    const disposeProviderInstance = vi.fn().mockResolvedValue(undefined)
    const loadModelsForProvider = vi.fn().mockRejectedValue(refreshError)
    const stageTranscriptionProviderConfig = vi.fn().mockResolvedValue(undefined)
    const persistProviderConfigIfCurrent = vi.fn().mockResolvedValue(undefined)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(commitProviderConfigEdit({
      config: { model: 'sensevoice' },
      providerId: 'provider-a',
      status: 'configured',
    }, {
      disposeProviderInstance,
      loadModelsForProvider,
      persistProviderConfigIfCurrent,
      stageTranscriptionProviderConfig,
    })).resolves.toBeUndefined()

    expect(persistProviderConfigIfCurrent).toHaveBeenCalledOnce()
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to refresh models after saving provider config:',
      refreshError,
    )
  })
})
