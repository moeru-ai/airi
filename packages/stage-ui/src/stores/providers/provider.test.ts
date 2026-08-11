import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useProviderConfigStore } from './config'
import { useProviderStore } from './provider'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}))

describe('provider store synchronization boundary', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  // ROOT CAUSE:
  //
  // Provider actions, serializable runtime data, and computedAsync output
  // shared one synced store. Applying the derived ref in every Electron
  // renderer restarted its local async computation, which proposed another
  // snapshot and starved the main window's event loop.
  //
  // We fixed this by keeping executable actions in the provider store and
  // placing the replicated data in an internal state-only store.
  it('keeps replicated runtime data out of the executable provider store state', () => {
    const store = useProviderStore()
    const runtimeState = {
      models: [],
      modelStatus: 'ready' as const,
      modelError: null,
    }

    store.providerRuntimeState.openai = runtimeState

    expect(store.$state).not.toHaveProperty('providerRuntimeState')
    expect(store.$state).not.toHaveProperty('providerAvailabilityOverrides')
    expect(store.providerRuntimeState.openai).toEqual(runtimeState)
  })

  // ROOT CAUSE:
  //
  // A model request kept a reference to its runtime entry across an await.
  // A synced snapshot replaced that entry before the request completed. The
  // request then wrote ready to the detached entry and left the current entry
  // in loading state.
  it('updates the current runtime entry after a synced snapshot replaces it', async () => {
    const store = useProviderStore()
    const request = store.fetchModelsForProvider('official-provider')

    expect(store.providerRuntimeState['official-provider']?.modelStatus).toBe('loading')

    store.providerRuntimeState['official-provider'] = {
      models: [],
      modelStatus: 'loading',
      modelError: null,
    }

    await request

    expect(store.providerRuntimeState['official-provider']?.modelStatus).toBe('ready')
    expect(store.providerRuntimeState['official-provider']?.modelError).toBeNull()
    expect(store.providerRuntimeState['official-provider']?.models).toEqual([
      expect.objectContaining({ id: 'auto' }),
    ])
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3757074245
  it('does not refresh models when only the selected model changes (GitHub #2122)', async () => {
    const providerId = 'funasr-audio-transcription'
    const store = useProviderStore()
    const configStore = useProviderConfigStore()
    store.initializeProvider(providerId)
    await new Promise(resolve => setTimeout(resolve, 0))
    configStore.setProviderStatus(providerId, 'configured')
    await store.refreshModelsForChangedCredentials()
    expect(configStore.getProvider(providerId)?.status).toBe('configured')

    const listModels = vi.spyOn(store.getProviderDefinition(providerId).extraMethods!, 'listModels')
    configStore.getProviderConfig(providerId)!.model = 'paraformer'
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(listModels).not.toHaveBeenCalled()
  })
})
