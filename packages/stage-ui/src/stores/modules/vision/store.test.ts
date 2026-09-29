import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useVisionStore } from './store'

const catalogs: Record<string, { models: Array<{ id: string }>, defaultModel: string | null }> = {
  'apple-vision': { models: [{ id: 'system' }], defaultModel: 'system' },
  'vision-ollama': { models: [{ id: 'llava' }], defaultModel: null },
}
const providerStore = {
  fetchModelsForProvider: vi.fn(async () => {}),
  getDefaultModelForProvider: vi.fn((id: string) => catalogs[id]?.defaultModel ?? null),
  getModelsForProvider: vi.fn((id: string) => catalogs[id]?.models ?? []),
  supportsModelListing: vi.fn(() => true),
}

vi.mock('../../providers/provider', () => ({ useProviderStore: () => providerStore }))

describe('vision store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  // ROOT CAUSE:
  //
  // The active model stayed `auto`, the model of the official provider, after
  // Apple Vision became the vision provider. Apple Vision rejected `auto`.
  //
  // We fixed this by selecting the catalog default for a model outside the catalog.
  it('replaces a model outside the catalog with the catalog default', async () => {
    const store = useVisionStore()
    store.activeProvider = 'apple-vision'
    store.activeModel = 'auto'

    await store.loadModelsForProvider('apple-vision')

    expect(providerStore.fetchModelsForProvider).toHaveBeenCalledWith('apple-vision')
    expect(store.activeModel).toBe('system')
  })

  it('keeps a model in the catalog and a custom model of a catalog without a default', async () => {
    const store = useVisionStore()
    store.activeProvider = 'apple-vision'
    store.activeModel = 'system'
    await store.loadModelsForProvider('apple-vision')
    expect(store.activeModel).toBe('system')

    store.activeProvider = 'vision-ollama'
    store.activeModel = 'custom-llava'
    await store.loadModelsForProvider('vision-ollama')
    expect(store.activeModel).toBe('custom-llava')
  })

  it('leaves the selection unchanged when it loads another provider', async () => {
    const store = useVisionStore()
    store.activeProvider = 'vision-ollama'
    store.activeModel = 'llava'

    await store.loadModelsForProvider('apple-vision')

    expect(store.activeModel).toBe('llava')
  })
})
