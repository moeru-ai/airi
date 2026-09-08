import type { AiriCard } from '../../types/airiCard'

import { PiniaColada } from '@pinia/colada'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, toRaw } from 'vue'

import { DEFAULT_ARTISTRY_WIDGET_SPAWNING_PROMPT } from '../../constants/prompts/character-defaults'
import { useAiriCardStore } from './airi-card'
import { useArtistryStore } from './artistry'
import { useConsciousnessStore } from './consciousness'
import { useSpeechStore } from './speech'
import { useVisionStore } from './vision'

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

function card(provider = '', model = ''): AiriCard {
  return {
    name: 'Imported card',
    version: '1.0.0',
    description: '',
    extensions: {
      airi: {
        modules: {
          consciousness: { provider, model },
          vision: { provider: '', model: '' },
          speech: { provider: '', model: '', voice_id: '' },
        },
        agents: {},
      },
    },
  }
}

describe('card inheritance with real module stores', () => {
  beforeEach(() => {
    const pinia = createPinia()
    createApp({}).use(pinia).use(PiniaColada)
    setActivePinia(pinia)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ recommended: {}, voices: [], data: [] }))))
  })

  afterEach(() => vi.unstubAllGlobals())

  // https://github.com/moeru-ai/airi/pull/2332
  // ROOT CAUSE:
  // Empty fields skipped runtime writes, so the previous card became the default.
  // Resolve each activation from saved defaults instead of the previous runtime.
  it('restores global settings after an explicit card', async () => {
    const consciousness = useConsciousnessStore()
    consciousness.activeProvider = 'global-provider'
    consciousness.activeModel = 'global-model'
    const cards = useAiriCardStore()
    await cards.initialize()
    const explicit = await cards.addCard(card('card-provider', 'card-model'), 'import')
    const inherited = await cards.addCard(card(), 'import')
    await cards.activateCard(explicit)
    expect(consciousness.activeModel).toBe('card-model')
    await cards.activateCard(inherited)
    expect(consciousness.activeProvider).toBe('global-provider')
    expect(consciousness.activeModel).toBe('global-model')
  })

  // https://github.com/moeru-ai/airi/pull/2332
  it('does not inherit a model from a different provider', async () => {
    const vision = useVisionStore()
    vision.activeProvider = 'global-provider'
    vision.activeModel = 'global-model'
    const cards = useAiriCardStore()
    await cards.initialize()
    const uploaded = card()
    uploaded.extensions.airi.modules.vision.provider = 'another-provider'
    const id = await cards.addCard(uploaded, 'import')
    await cards.activateCard(id)
    expect(vision.activeProvider).toBe('another-provider')
    expect(vision.activeModel).toBe('')
  })

  // https://github.com/moeru-ai/airi/pull/2332
  it('preserves explicit no-speech on the default card', async () => {
    const cards = useAiriCardStore()
    const muted = card()
    muted.extensions.airi.modules.speech.provider = 'speech-noop'
    cards.cards.set('default', muted)
    await cards.initialize()
    expect(cards.activeCard?.extensions.airi.modules.speech.provider).toBe('speech-noop')
    expect(useSpeechStore().activeSpeechProvider).toBe('speech-noop')
  })

  it('keeps the default artistry instruction on a fresh profile', async () => {
    const cards = useAiriCardStore()
    await cards.initialize()
    expect(cards.activeCard?.extensions.airi.modules.artistry?.widgetInstruction).toBe(DEFAULT_ARTISTRY_WIDGET_SPAWNING_PROMPT)
    expect(cards.systemPrompt).toContain(DEFAULT_ARTISTRY_WIDGET_SPAWNING_PROMPT)
  })

  it('restores defaults when an active override is cleared in the editor', async () => {
    const consciousness = useConsciousnessStore()
    consciousness.activeProvider = 'global-provider'
    consciousness.activeModel = 'global-model'
    const cards = useAiriCardStore()
    await cards.initialize()
    const id = await cards.addCard(card('card-provider', 'card-model'), 'import')
    await cards.activateCard(id)
    await cards.updateCard(id, card())
    expect(consciousness.activeProvider).toBe('global-provider')
    expect(consciousness.activeModel).toBe('global-model')
  })

  it('inherits a model only within the same provider', async () => {
    const consciousness = useConsciousnessStore()
    consciousness.activeProvider = 'global-provider'
    consciousness.activeModel = 'global-model'
    const cards = useAiriCardStore()
    await cards.initialize()
    const id = await cards.addCard(card('global-provider'), 'import')
    await cards.activateCard(id)
    expect(consciousness.activeModel).toBe('global-model')
    expect(cards.activeCard?.extensions.airi.modules.consciousness.model).toBe('')
  })

  it('keeps imported cards without an AIRI extension inherited', async () => {
    const consciousness = useConsciousnessStore()
    consciousness.activeProvider = 'global-provider'
    consciousness.activeModel = 'global-model'
    const cards = useAiriCardStore()
    await cards.initialize()
    const id = await cards.addCard({ name: 'Portable card', version: '1.0.0', description: '' }, 'import')
    expect(cards.getCard(id)?.extensions.airi.modules.consciousness).toEqual({ provider: '', model: '' })
  })

  it('preserves imported extension fields while filling module defaults', async () => {
    const cards = useAiriCardStore()
    await cards.initialize()
    const uploaded = card()
    const extensions = {
      other: { theme: 'blue' },
      airi: {
        ...uploaded.extensions.airi,
        importedMetadata: { revision: 2 },
        modules: {
          ...uploaded.extensions.airi.modules,
          customModule: { enabled: true },
          speech: { ...uploaded.extensions.airi.modules.speech, customVoiceOptions: { volume: 0.7 }, rate: 1.2 },
        },
      },
    }
    const id = await cards.addCard({ ...uploaded, extensions }, 'import')
    expect(cards.getCard(id)?.extensions).toMatchObject(extensions)
  })

  it('does not restore a removed provider from saved defaults', async () => {
    const consciousness = useConsciousnessStore()
    consciousness.activeProvider = 'removed-provider'
    consciousness.activeModel = 'global-model'
    const cards = useAiriCardStore()
    await cards.initialize()
    const id = await cards.addCard(card('removed-provider', 'card-model'), 'import')
    await cards.activateCard(id)
    await cards.clearProviderSelections('removed-provider')
    expect(cards.moduleDefaults?.consciousness).toEqual({ provider: '', model: '' })
    expect(cards.getCard(id)?.extensions.airi.modules.consciousness).toEqual({ provider: '', model: '' })
    await cards.activateCard('default')
    expect(consciousness.activeProvider).toBe('')
    expect(consciousness.activeModel).toBe('')
  })

  it('does not inherit a voice from a different speech model', async () => {
    const speech = useSpeechStore()
    speech.activeSpeechProvider = 'speech-provider'
    speech.activeSpeechModel = 'global-model'
    speech.activeSpeechVoiceId = 'global-voice'
    const cards = useAiriCardStore()
    await cards.initialize()
    const uploaded = card()
    uploaded.extensions.airi.modules.speech.model = 'card-model'
    const id = await cards.addCard(uploaded, 'import')
    await cards.activateCard(id)
    expect(speech.activeSpeechModel).toBe('card-model')
    expect(speech.activeSpeechVoiceId).toBe('')
    await cards.activateCard('default')
    expect(speech.activeSpeechModel).toBe('global-model')
    expect(speech.activeSpeechVoiceId).toBe('global-voice')
  })

  it('keeps artistry models and options within their provider', async () => {
    const artistry = useArtistryStore()
    artistry.globalProvider = 'comfyui'
    artistry.globalModel = 'global-model'
    artistry.globalProviderOptions = { workflow: 'global-workflow' }
    const cards = useAiriCardStore()
    await cards.initialize()
    const uploaded = card()
    uploaded.extensions.airi.modules.artistry = { enabled: true, provider: 'replicate', model: '' }
    const id = await cards.addCard(uploaded, 'import')
    await cards.activateCard(id)
    expect(artistry.activeProvider).toBe('replicate')
    expect(artistry.activeModel).toBe('')
    expect(artistry.providerOptions).toBeUndefined()
    await cards.activateCard('default')
    expect(artistry.activeModel).toBe('global-model')
    expect(artistry.providerOptions).toEqual({ workflow: 'global-workflow' })
  })

  it('keeps defaults separate across persisted state and follower snapshots', async () => {
    const leader = createPinia()
    createApp({}).use(leader).use(PiniaColada)
    setActivePinia(leader)
    const consciousness = useConsciousnessStore(leader)
    consciousness.activeProvider = 'global-provider'
    consciousness.activeModel = 'global-model'
    const cards = useAiriCardStore(leader)
    await cards.initialize()
    const id = await cards.addCard(card('card-provider', 'card-model'), 'import')
    await cards.activateCard(id)
    const snapshot = structuredClone({
      cards: toRaw(cards.cards),
      activeCardId: cards.activeCardId,
      moduleDefaults: toRaw(cards.moduleDefaults),
    })

    const follower = createPinia()
    createApp({}).use(follower).use(PiniaColada)
    setActivePinia(follower)
    const followerConsciousness = useConsciousnessStore(follower)
    followerConsciousness.activeProvider = 'card-provider'
    followerConsciousness.activeModel = 'card-model'
    const followerCards = useAiriCardStore(follower)
    const updates = vi.fn()
    followerConsciousness.$subscribe(updates, { flush: 'sync' })
    followerCards.$patch(snapshot)
    await nextTick()
    // Applying a card snapshot must not start another runtime transition.
    expect(updates).not.toHaveBeenCalled()
    await followerCards.initialize()
    await followerCards.activateCard('default')
    expect(followerConsciousness.activeProvider).toBe('global-provider')
    expect(followerConsciousness.activeModel).toBe('global-model')
  })

  it('keeps card overrides unchanged across login, logout, and another activation', async () => {
    const cards = useAiriCardStore()
    await cards.initialize()
    const id = await cards.addCard(card('official-provider', 'auto'), 'import')
    await cards.activateCard(id)
    await cards.configureForAuthentication(true)
    expect(useConsciousnessStore().activeProvider).toBe('official-provider')
    await cards.configureForAuthentication(false)
    expect(useConsciousnessStore().activeProvider).toBe('')
    await cards.activateCard('default')
    await cards.activateCard(id)
    expect(useConsciousnessStore().activeProvider).toBe('')
    expect(cards.activeCard?.extensions.airi.modules.consciousness).toEqual({ provider: 'official-provider', model: 'auto' })
    await cards.configureForAuthentication(true)
    expect(useConsciousnessStore().activeModel).toBe('auto')
  })

  it('does not write login defaults into empty uploaded-card fields', async () => {
    const cards = useAiriCardStore()
    await cards.initialize()
    const id = await cards.addCard(card(), 'import')
    await cards.activateCard(id)
    await cards.configureForAuthentication(true)
    expect(useConsciousnessStore().activeModel).toBe('auto')
    expect(cards.activeCard?.extensions.airi.modules.consciousness).toEqual({ provider: '', model: '' })
    await cards.configureForAuthentication(false)
    expect(cards.activeCard?.extensions.airi.modules.speech.provider).toBe('')
    expect(useSpeechStore().activeSpeechProvider).toBe('speech-noop')
  })

  // https://github.com/moeru-ai/airi/pull/2332#discussion_r3820590225
  it('reapplies model and voice overrides after login fills inherited providers', async () => {
    const cards = useAiriCardStore()
    await cards.initialize()
    const uploaded = card('', 'card-model')
    uploaded.extensions.airi.modules.speech.voice_id = 'card-voice'
    const id = await cards.addCard(uploaded, 'import')
    await cards.activateCard(id)
    await cards.configureForAuthentication(true)
    expect(useConsciousnessStore().activeProvider).toBe('official-provider')
    expect(useConsciousnessStore().activeModel).toBe('card-model')
    expect(useSpeechStore().activeSpeechVoiceId).toBe('card-voice')
    expect(cards.moduleDefaults?.consciousness.model).toBe('auto')
    expect(cards.activeCard?.extensions.airi.modules.consciousness.provider).toBe('')
    expect(cards.activeCard?.extensions.airi.modules.speech.provider).toBe('')
  })
})
