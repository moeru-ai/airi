import type { InferenceServiceProvider } from '../../libs/providers/types'

import { PiniaColada } from '@pinia/colada'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'

import { useProviderConfigStore } from './config'

const mocks = vi.hoisted(() => ({
  client: {},
  service: {
    buildLocal: vi.fn(),
    fetchRemote: vi.fn(),
    createRemote: vi.fn(),
    deleteRemote: vi.fn(),
    patchConfigRemote: vi.fn(),
  },
}))

vi.mock('../../composables/api', () => ({ client: mocks.client }))
vi.mock('../../services/inference-service-providers', () => ({ inferenceServiceProvidersService: mocks.service }))
vi.mock('../../libs/providers', () => ({
  getDefinedProvider: vi.fn(() => ({ id: 'openai-compatible', name: 'OpenAI Compatible' })),
}))

const localProvider = {
  id: 'local-provider',
  definitionId: 'openai-compatible',
  config: {},
  status: 'unconfigured',
  configuredBy: 'user',
} satisfies InferenceServiceProvider

const remoteProvider = {
  ...localProvider,
  id: 'remote-provider',
} satisfies InferenceServiceProvider

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function installStore() {
  const app = createApp({})
  const pinia = createPinia()
  app.use(pinia)
  app.use(PiniaColada)
  setActivePinia(pinia)
  return useProviderConfigStore()
}

function claimConfigCommit(
  store: ReturnType<typeof useProviderConfigStore>,
  config: Record<string, unknown>,
  commitId: string,
) {
  const provider = store.providers[localProvider.id]!
  const ownership = store.providerConfigCommitOwnership[localProvider.id]
  store.providerConfigCommitOwnership[localProvider.id] = {
    currentCommitId: commitId,
    appliedCommits: [
      ...(ownership?.appliedCommits ?? []),
      { commitId, expiresAt: Date.now() + 60_000 },
    ],
  }
  store.providers[localProvider.id] = { ...provider, config, status: 'configured' }
}

describe('provider config store', () => {
  beforeEach(() => {
    mocks.service.buildLocal.mockReturnValue(localProvider)
    mocks.service.fetchRemote.mockResolvedValue({})
    mocks.service.createRemote.mockResolvedValue(remoteProvider)
    mocks.service.deleteRemote.mockResolvedValue(undefined)
    mocks.service.patchConfigRemote.mockResolvedValue(remoteProvider)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('loads the local snapshot before it applies the remote snapshot', async () => {
    mocks.service.fetchRemote.mockResolvedValue({ [remoteProvider.id]: remoteProvider })
    const store = installStore()
    store.providers[localProvider.id] = localProvider

    await expect(store.fetchProviders()).resolves.toEqual({
      [localProvider.id]: localProvider,
      [remoteProvider.id]: remoteProvider,
    })

    expect(store.providers).toEqual({
      [localProvider.id]: localProvider,
      [remoteProvider.id]: remoteProvider,
    })
  })

  it('keeps the local snapshot when the remote list fails', async () => {
    mocks.service.fetchRemote.mockRejectedValue(new Error('remote unavailable'))
    const store = installStore()
    store.providers[localProvider.id] = localProvider

    await expect(store.fetchProviders()).resolves.toEqual({ [localProvider.id]: localProvider })

    expect(store.providers).toEqual({ [localProvider.id]: localProvider })
  })

  it('keeps a new local provider when the remote create fails', async () => {
    mocks.service.createRemote.mockRejectedValue(new Error('remote unavailable'))
    const store = installStore()

    await expect(store.addProvider(localProvider.definitionId)).resolves.toEqual(localProvider)

    expect(store.providers[localProvider.id]).toEqual(localProvider)
  })

  it('replaces the optimistic id and keeps the remote provider listed', async () => {
    const store = installStore()

    await expect(store.addProvider(localProvider.definitionId)).resolves.toEqual(remoteProvider)

    expect(store.providers[localProvider.id]).toBeUndefined()
    expect(store.listedProviders[remoteProvider.id]).toEqual(remoteProvider)
  })

  it('updates and removes a provider through the store interface', async () => {
    const store = installStore()
    store.providers[localProvider.id] = localProvider

    const commitId = 'config-update'
    claimConfigCommit(store, { apiKey: 'sk-test' }, commitId)
    await store.persistProviderConfigIfCurrent(localProvider.id, { apiKey: 'sk-test' }, 'configured', commitId)
    await store.removeProvider(remoteProvider.id)

    expect(mocks.service.patchConfigRemote).toHaveBeenCalledWith(
      mocks.client,
      localProvider.id,
      { apiKey: 'sk-test' },
      'configured',
    )
    expect(mocks.service.deleteRemote).toHaveBeenCalledWith(mocks.client, remoteProvider.id)
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3888398390
  it('ignores an older remote config response after a newer save (GitHub #2122)', async () => {
    const firstRemoteWrite = deferred<InferenceServiceProvider>()
    const secondRemoteWrite = deferred<InferenceServiceProvider>()
    mocks.service.patchConfigRemote
      .mockImplementationOnce(async () => firstRemoteWrite.promise)
      .mockImplementationOnce(async () => secondRemoteWrite.promise)
    const store = installStore()
    store.providers[localProvider.id] = localProvider

    claimConfigCommit(store, { model: 'first-model' }, 'first-save')
    const firstUpdate = store.persistProviderConfigIfCurrent(localProvider.id, { model: 'first-model' }, 'configured', 'first-save')
    claimConfigCommit(store, { model: 'second-model' }, 'second-save')
    const secondUpdate = store.persistProviderConfigIfCurrent(localProvider.id, { model: 'second-model' }, 'configured', 'second-save')
    secondRemoteWrite.resolve({ ...localProvider, config: { model: 'second-model' }, status: 'configured' })
    await secondUpdate
    firstRemoteWrite.resolve({ ...localProvider, config: { model: 'first-model' }, status: 'configured' })
    await firstUpdate

    // ROOT CAUSE:
    //
    // Remote saves can finish out of order. Applying every response unconditionally lets an
    // older response replace the latest local config while Hearing keeps the latest model.
    expect(store.getProviderConfig(localProvider.id)?.model).toBe('second-model')
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3888398390
  it('ignores a remote config response after a newer model action (GitHub #2122)', async () => {
    const remoteWrite = deferred<InferenceServiceProvider>()
    mocks.service.patchConfigRemote.mockImplementationOnce(async () => remoteWrite.promise)
    const store = installStore()
    store.providers[localProvider.id] = localProvider

    claimConfigCommit(store, { model: 'saved-model' }, 'saved-model')
    const update = store.persistProviderConfigIfCurrent(localProvider.id, { model: 'saved-model' }, 'configured', 'saved-model')
    store.getProviderConfig(localProvider.id)!.model = 'newer-model'
    remoteWrite.resolve({ ...localProvider, config: { model: 'saved-model' }, status: 'configured' })
    await update

    // ROOT CAUSE:
    //
    // Model actions mutate provider config without starting another save revision. Ownership
    // must compare the full optimistic snapshot before accepting the remote response.
    expect(store.getProviderConfig(localProvider.id)?.model).toBe('newer-model')
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3888398390
  it('does not send a stale config after a newer commit takes ownership (GitHub #2122)', async () => {
    const store = installStore()
    store.providers[localProvider.id] = localProvider
    claimConfigCommit(store, { model: 'old-model' }, 'old-save')
    claimConfigCommit(store, { model: 'new-model' }, 'new-save')

    await store.persistProviderConfigIfCurrent(localProvider.id, { model: 'old-model' }, 'configured', 'old-save')

    // ROOT CAUSE:
    //
    // Checking snapshot ownership only after PATCH still lets a replayed action overwrite the
    // backend. A stale commit must be rejected before the service boundary.
    expect(mocks.service.patchConfigRemote).not.toHaveBeenCalled()
  })
})
