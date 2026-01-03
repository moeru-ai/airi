import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { providerOpenAICompatible } from '../libs/providers/providers/openai-compatible'
import { useProviderCatalogStore } from './provider-catalog'

describe('store provider-catalog', () => {
  beforeEach(() => {
    // creates a fresh pinia and makes it active
    // so it's automatically picked up by any useStore() call
    // without having to pass it to it: `useStore(pinia)`
    setActivePinia(createPinia())
  })

  it('add', () => {
    const store = useProviderCatalogStore()
    store.addProvider(providerOpenAICompatible.id)

    expect(Object.values(store.configs)).toHaveLength(1)
    expect(Object.values(store.configs)[0].id).toBeDefined()
    expect(Object.values(store.configs)[0].definitionId).toBe(providerOpenAICompatible.id)
    expect(Object.values(store.configs)[0].name).toBe('OpenAI Compatible')
    expect(Object.values(store.configs)[0].config).toStrictEqual({})
  })

  it('remove', () => {
    const store = useProviderCatalogStore()
    store.addProvider(providerOpenAICompatible.id)

    const providerId = Object.keys(store.configs)[0]
    store.removeProvider(providerId)

    expect(Object.values(store.configs)).toHaveLength(0)
  })
})
