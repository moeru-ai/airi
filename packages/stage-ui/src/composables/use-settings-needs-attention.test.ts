import type { AiriCard } from '../types/airiCard'

import { PiniaColada } from '@pinia/colada'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'

import { useAiriCardStore } from '../stores/modules/airi-card'
import { useProviderConfigStore } from '../stores/providers/config'
import { useProviderStore } from '../stores/providers/provider'
import { useSettingsNeedsAttention } from './use-settings-needs-attention'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ locale: { value: 'en' }, t: (key: string) => key }),
}))

vi.mock('localforage', () => ({
  default: {
    getItem: vi.fn(async () => undefined),
    iterate: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
    setItem: vi.fn(async <T>(_: string, value: T) => value),
  },
}))

function cardWithSpeech(provider: string): AiriCard {
  return {
    name: 'Tester',
    version: '1.0.0',
    description: '',
    extensions: {
      airi: {
        avatarModels: [],
        modules: {
          consciousness: { provider: '', model: '' },
          vision: { provider: '', model: '' },
          speech: { provider, model: 'model', voice_id: 'voice' },
        },
        agents: {},
      },
    },
  }
}

/** The list calls no selection unusable before the provider registry loads. */
async function waitForProviderRegistry() {
  const providers = useProviderStore()
  await vi.waitFor(() => expect(providers.availableProvidersMetadata.length).toBeGreaterThan(0), { timeout: 10_000 })
}

describe('useSettingsNeedsAttention', () => {
  beforeEach(() => {
    const pinia = createPinia()
    createApp({}).use(pinia).use(PiniaColada)
    setActivePinia(pinia)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ recommended: {}, voices: [], data: [] }))))
  })

  afterEach(() => vi.unstubAllGlobals())

  // ROOT CAUSE:
  //
  // The added flag of a provider stays after an update removes the provider.
  // A selection of an added provider that the module page did not list counted as reported by a provider item.
  // A removed provider has no metadata, so no provider item reported it, and the list stayed empty.
  it('lists a character whose provider no longer exists, even when the provider is still marked as added', async () => {
    const cards = useAiriCardStore()
    await cards.initialize()
    const characterId = await cards.addCard(cardWithSpeech('removed-speech-provider'), 'import')
    await waitForProviderRegistry()
    useProviderConfigStore().markProviderAdded('removed-speech-provider')

    const { items } = useSettingsNeedsAttention()

    expect(items.value.map(item => item.id)).toContain(`provider-unavailable:${characterId}:speech`)
  })

  it('waits for the check of an added provider of the right kind', async () => {
    const cards = useAiriCardStore()
    await cards.initialize()
    const characterId = await cards.addCard(cardWithSpeech('minimax-speech'), 'import')
    await waitForProviderRegistry()
    await useProviderStore().initializeProvider('minimax-speech')
    useProviderConfigStore().markProviderAdded('minimax-speech')

    const { items, moduleSelections } = useSettingsNeedsAttention()

    expect(items.value.map(item => item.id)).not.toContain(`provider-unavailable:${characterId}:speech`)
    expect(moduleSelections.value.find(selection => selection.key === `${characterId}:speech`)?.state).toBe('awaiting-check')
  })
})
