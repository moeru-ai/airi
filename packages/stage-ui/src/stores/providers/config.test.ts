import type { InferenceServiceProvider } from '../../libs/providers/types'

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useProviderConfigStore } from './config'

const storedProvider = {
  id: 'stored-provider',
  definitionId: 'openai-compatible',
  config: { baseUrl: 'https://example.com/v1/' },
  status: 'unconfigured',
} satisfies InferenceServiceProvider

function installStore() {
  setActivePinia(createPinia())
  return useProviderConfigStore()
}

describe('provider config store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('creates and lists a provider record for a registered definition', async () => {
    const store = installStore()

    const provider = await store.addProvider('openai-compatible', { apiKey: 'sk-test' })

    expect(provider.definitionId).toBe('openai-compatible')
    expect(provider.status).toBe('unconfigured')
    expect(provider.config).toEqual({ apiKey: 'sk-test' })
    expect(store.getProvider(provider.id)).toEqual(provider)
    expect(store.listedProviders[provider.id]).toEqual(provider)
    expect(store.configs[provider.id]).toEqual({ apiKey: 'sk-test' })
  })

  it('rejects a provider whose definition is not registered', async () => {
    const store = installStore()

    await expect(store.addProvider('missing-definition')).rejects.toThrow(
      'Provider definition with id "missing-definition" not found.',
    )

    expect(store.providers).toEqual({})
  })

  it('replaces the configuration and the validation status', async () => {
    const store = installStore()
    store.providers[storedProvider.id] = { ...storedProvider }

    const updated = await store.updateProviderConfig(storedProvider.id, { apiKey: 'sk-test' }, 'configured')

    expect(updated).toEqual({ ...storedProvider, config: { apiKey: 'sk-test' }, status: 'configured' })
    expect(store.getProviderConfig(storedProvider.id)).toEqual({ apiKey: 'sk-test' })
    expect(store.configuredProviders[storedProvider.id]).toBe(true)
  })

  it('ignores a configuration update for a provider that is not stored', async () => {
    const store = installStore()

    await expect(store.updateProviderConfig('missing-provider', { apiKey: 'sk-test' }, 'configured')).resolves.toBeUndefined()

    expect(store.getProvider('missing-provider')).toBeUndefined()
  })

  it('removes the provider record together with its listed flag', async () => {
    const store = installStore()
    store.providers[storedProvider.id] = { ...storedProvider }
    await store.markProviderAdded(storedProvider.id)

    await store.removeProvider(storedProvider.id)

    expect(store.getProvider(storedProvider.id)).toBeUndefined()
    expect(store.listedProviders[storedProvider.id]).toBeUndefined()
  })

  it('merges patched configuration into the stored provider fields', () => {
    const store = installStore()
    store.providers[storedProvider.id] = { ...storedProvider }

    expect(store.patchProviderConfig(storedProvider.id, { apiKey: 'sk-test' })).toBe(true)
    expect(store.getProviderConfig(storedProvider.id)).toEqual({
      apiKey: 'sk-test',
      baseUrl: 'https://example.com/v1/',
    })
  })

  it('does not create an incomplete provider while patching configuration', () => {
    const store = installStore()

    expect(store.patchProviderConfig('missing-provider', { apiKey: 'sk-test' })).toBe(false)
    expect(store.getProvider('missing-provider')).toBeUndefined()
  })

  it('reuses the stored provider when the same id is ensured twice', async () => {
    const store = installStore()
    store.providers[storedProvider.id] = { ...storedProvider }
    const first = store.ensureProvider(storedProvider.id, storedProvider.definitionId)

    const second = store.ensureProvider(storedProvider.id, storedProvider.definitionId, { apiKey: 'sk-test' })

    expect(second).toEqual(first)
    expect(store.getProviderConfig(storedProvider.id)).toEqual({ baseUrl: 'https://example.com/v1/' })
  })

  it('creates a provider through ensureProvider when the id is unknown', () => {
    const store = installStore()

    const provider = store.ensureProvider('new-provider', 'openai-compatible', { apiKey: 'sk-test' })

    expect(provider).toMatchObject({ id: 'new-provider', definitionId: 'openai-compatible', status: 'unconfigured' })
    expect(store.getProvider('new-provider')).toEqual(provider)
  })

  it('rejects ensureProvider for a definition that is not registered', () => {
    const store = installStore()

    expect(() => store.ensureProvider('new-provider', 'missing-definition')).toThrow(
      'Provider definition with id "missing-definition" not found.',
    )
  })

  it('clears every provider record and listed flag on reset', async () => {
    const store = installStore()
    store.providers[storedProvider.id] = { ...storedProvider }
    await store.markProviderAdded(storedProvider.id)

    await store.resetProviders()

    expect(store.providers).toEqual({})
    expect(store.addedProviders).toEqual({})
  })
})
