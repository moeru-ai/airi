import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { defineProvider } from '../../libs/providers/providers/registry'
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

  // ROOT CAUSE:
  //
  // The configured-provider lists read only persisted validation state. A
  // local provider whose availability probe is its complete configuration
  // never entered the list that Hearing uses for transcription selection.
  it('lists an available provider that opts into automatic configuration', async () => {
    const providerId = 'test-local-transcription'
    defineProvider({
      id: providerId,
      name: 'Test Local Transcription',
      nameLocalize: () => 'Test Local Transcription',
      description: 'Local transcription for this test.',
      descriptionLocalize: () => 'Local transcription for this test.',
      tasks: ['speech-to-text'],
      requiresCredentials: false,
      autoConfigureWhenAvailable: true,
      isAvailableBy: () => true,
      createProviderConfig: () => z.object({}),
      createProvider: () => ({
        transcription: (model: string) => ({
          baseURL: 'https://example.invalid/',
          model,
        }),
      }),
    })
    setActivePinia(createPinia())

    const store = useProviderStore()

    await vi.waitFor(() => {
      expect(store.configuredTranscriptionProvidersMetadata).toContainEqual(
        expect.objectContaining({ configured: true, id: providerId }),
      )
    })
  })
})
