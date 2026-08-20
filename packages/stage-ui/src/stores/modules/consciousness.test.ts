// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { useProviderConfigStore } from '../providers/config'
import { useProviderStore } from '../providers/provider'
import { useConsciousnessStore } from './consciousness'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    locale: { value: 'en-US' },
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}))

describe('consciousness store provider selection', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  // ROOT CAUSE:
  //
  // supportsModelListing called a throwing metadata lookup for unknown ids.
  // With no provider selected yet (fresh install or reset state persists ''),
  // evaluating the computed surfaced a raw "Provider metadata for  not found"
  // error to the user.
  //
  // We fixed this by checking the ProviderDefinition registry through the
  // runtime store without building executable ProviderMetadata objects.
  //
  // https://github.com/moeru-ai/airi/issues/1761
  it('reports no model listing support instead of throwing when no provider is selected (Issue #1761)', () => {
    const store = useConsciousnessStore()

    expect(store.activeProvider).toBe('')
    expect(() => store.supportsModelListing).not.toThrow()
    expect(store.supportsModelListing).toBe(false)
  })

  it('reports no model listing support for a stale provider id that no longer exists (Issue #1761)', () => {
    const store = useConsciousnessStore()

    store.activeProvider = 'provider-deleted-long-ago'

    expect(() => store.supportsModelListing).not.toThrow()
    expect(store.supportsModelListing).toBe(false)
  })

  it('findProviderDefinition returns known provider definitions', () => {
    const providersStore = useProviderStore()

    const definition = providersStore.findProviderDefinition('openai')

    expect(definition).toBeDefined()
    expect(definition?.id).toBe('openai')
  })

  it('findProviderDefinition returns undefined for empty and unknown ids', () => {
    const providersStore = useProviderStore()

    expect(providersStore.findProviderDefinition('')).toBeUndefined()
    expect(providersStore.findProviderDefinition('nope')).toBeUndefined()
  })

  it('resolves definitions through a configured provider instance id', () => {
    const providerStore = useProviderConfigStore()
    const providersStore = useProviderStore()
    providerStore.ensureProvider('custom-openai', 'openai', { apiKey: 'sk-test' })

    const definition = providersStore.findProviderDefinition('custom-openai')

    expect(definition?.id).toBe('openai')
    expect(definition?.name).toBe('OpenAI')
  })

  // ROOT CAUSE:
  //
  // The model selection was only cleared on provider switches by a watcher in
  // the consciousness settings page. Provider changes made anywhere else
  // (onboarding, character cards, provider deletion) kept the previous
  // provider's model id, and the next chat request failed upstream with
  // 404 model_not_found (e.g. "Model gpt-oss-120b does not exist").
  //
  // We fixed this by moving the reset into the store itself, next to the
  // state it protects.
  //
  // https://github.com/moeru-ai/airi/issues/1761
  it('clears the model selection when the provider changes (Issue #1761)', () => {
    const store = useConsciousnessStore()

    store.activeProvider = 'cerebras'
    store.activeModel = 'gpt-oss-120b'
    store.customModelName = 'custom-name'

    store.activeProvider = 'openai'

    expect(store.activeModel).toBe('')
    expect(store.customModelName).toBe('')
  })

  it('clears the model synchronously so callers can set a new one right after', () => {
    const store = useConsciousnessStore()

    store.activeProvider = 'cerebras'
    store.activeModel = 'gpt-oss-120b'

    // The set-provider-then-set-model sequence used by auth provider sync and
    // character cards must keep the newly assigned model.
    store.activeProvider = 'official-provider'
    store.activeModel = 'auto'

    expect(store.activeModel).toBe('auto')
  })

  it('keeps the persisted model when the provider stays the same', () => {
    const store = useConsciousnessStore()

    store.activeProvider = 'openai'
    store.activeModel = 'gpt-4o-mini'

    store.activeProvider = 'openai'

    expect(store.activeModel).toBe('gpt-4o-mini')
  })

  // ROOT CAUSE:
  //
  // The store used Pinia synchronization and storage event synchronization
  // for the same state. An incoming Pinia snapshot changed the provider and
  // reset the model. A stale storage event then restored the previous model.
  // Both windows published each reflected change and created an endless loop.
  //
  // We fixed this by keeping localStorage as one-way persistence. Pinia is the
  // only channel that can update live state across windows.
  it('does not apply storage events as a second cross-window state channel', async () => {
    const store = useConsciousnessStore()

    store.activeProvider = 'official-provider'
    store.activeModel = 'auto'
    await nextTick()

    window.dispatchEvent(new StorageEvent('storage', {
      key: 'settings/consciousness/active-model',
      newValue: '',
      storageArea: localStorage,
    }))
    await nextTick()
    await nextTick()

    expect(store.activeModel).toBe('auto')
  })
})
