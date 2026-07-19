import type { AiriCard } from './airi-card'

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useSettingsStageModel } from '../settings/stage-model'
import { useAiriCardStore } from './airi-card'

// NOTICE:
// Vitest runs these store tests in Node, where localforage cannot select a
// browser storage driver. The stage-model watcher legitimately asks the
// display-model store to resolve IDs, so provide the storage boundary with a
// deterministic no-op instead of allowing rejected driver initialization to
// escape as an unrelated test error.
vi.mock('localforage', () => ({
  default: {
    getItem: vi.fn(async () => undefined),
    iterate: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
    setItem: vi.fn(async <T>(_: string, value: T) => value),
  },
}))

vi.mock('./artistry', async () => {
  const { defineStore } = await import('pinia')

  return {
    useArtistryStore: defineStore('artistry', {
      state: () => ({
        globalProvider: 'mock-artistry-provider',
        globalModel: 'mock-artistry-model',
        globalPromptPrefix: 'mock-artistry-prefix',
        globalProviderOptions: {},
        activeProvider: 'mock-artistry-provider',
        activeModel: 'mock-artistry-model',
        defaultPromptPrefix: 'mock-artistry-prefix',
        providerOptions: {},
      }),
      actions: {
        resetToGlobal() {},
      },
    }),
  }
})

vi.mock('./consciousness', async () => {
  const { defineStore } = await import('pinia')

  return {
    useConsciousnessStore: defineStore('consciousness', {
      state: () => ({
        activeProvider: 'mock-consciousness-provider',
        activeModel: 'mock-consciousness-model',
      }),
    }),
  }
})

vi.mock('./speech', async () => {
  const { defineStore } = await import('pinia')

  return {
    useSpeechStore: defineStore('speech', {
      state: () => ({
        activeSpeechProvider: 'mock-speech-provider',
        activeSpeechModel: 'mock-speech-model',
        activeSpeechVoiceId: 'mock-speech-voice',
      }),
    }),
  }
})

vi.mock('./vision', async () => {
  const { defineStore } = await import('pinia')

  return {
    useVisionStore: defineStore('vision', {
      state: () => ({
        activeProvider: 'mock-vision-provider',
        activeModel: 'mock-vision-model',
      }),
    }),
  }
})

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

/**
 * @example
 * describe('airi-card store', () => {})
 */
describe('airi-card store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  /**
   * @example
   * it('persists selected module config on active card', () => {})
   */
  it('persists selected module config on active card', () => {
    const stageModelStore = useSettingsStageModel()
    stageModelStore.stageModelSelected = 'preset-live2d-1'

    const cardStore = useAiriCardStore()
    cardStore.initialize()

    expect(cardStore.updateActiveCardDisplayModel('display-model-iru-v2')).toBe(true)
    expect(cardStore.updateActiveCardConsciousness({ provider: 'openrouter-ai', model: 'anthropic/claude-sonnet' })).toBe(true)
    expect(cardStore.updateActiveCardVision({ provider: 'ollama', model: 'llava' })).toBe(true)
    expect(cardStore.updateActiveCardSpeech({ provider: 'elevenlabs', model: 'eleven_multilingual_v2', voice_id: 'aria' })).toBe(true)
    expect(cardStore.activeCard?.extensions.airi.modules).toMatchObject({
      displayModelId: 'display-model-iru-v2',
      consciousness: { provider: 'openrouter-ai', model: 'anthropic/claude-sonnet' },
      vision: { provider: 'ollama', model: 'llava' },
      speech: { provider: 'elevenlabs', model: 'eleven_multilingual_v2', voice_id: 'aria' },
    })
    expect(stageModelStore.stageModelSelected).toBe('display-model-iru-v2')
  })

  // ROOT CAUSE:
  //
  // Card activation changes `activeCardId`, but the previous implementation
  // only observed the debounced `activeCard` object. Some card switchers keep
  // the same object reference while changing the selected ID, so the runtime
  // stage model stayed on the previous card's model.
  //
  // We fixed this by applying card settings from the stable activation key.
  // https://github.com/moeru-ai/airi/issues/2089
  it('issue #2089: applies the activated card display model to the stage runtime', () => {
    const stageModelStore = useSettingsStageModel()
    stageModelStore.stageModelSelected = 'preset-live2d-1'

    const cardStore = useAiriCardStore()
    cardStore.initialize()

    const card: AiriCard = {
      name: 'VRM card',
      version: '1.0.0',
      description: 'Card with a VRM display model',
      extensions: {
        airi: {
          modules: {
            consciousness: { provider: 'mock-consciousness-provider', model: 'mock-consciousness-model' },
            vision: { provider: 'mock-vision-provider', model: 'mock-vision-model' },
            speech: { provider: 'mock-speech-provider', model: 'mock-speech-model', voice_id: 'mock-speech-voice' },
            displayModelId: 'preset-vrm-1',
          },
          agents: {},
        },
      },
    }
    const cardId = cardStore.addCard(card, 'scratch')

    cardStore.activeCardId = cardId

    expect(stageModelStore.stageModelSelected).toBe('preset-vrm-1')
  })

  it('applies edits to the currently active card display model', () => {
    const stageModelStore = useSettingsStageModel()
    stageModelStore.stageModelSelected = 'preset-live2d-1'

    const cardStore = useAiriCardStore()
    cardStore.initialize()

    const cardId = cardStore.addCard({
      name: 'Editable card',
      version: '1.0.0',
      description: 'Card whose model can be edited',
      extensions: {
        airi: {
          modules: {
            consciousness: { provider: 'mock-consciousness-provider', model: 'mock-consciousness-model' },
            vision: { provider: 'mock-vision-provider', model: 'mock-vision-model' },
            speech: { provider: 'mock-speech-provider', model: 'mock-speech-model', voice_id: 'mock-speech-voice' },
            displayModelId: 'preset-live2d-1',
          },
          agents: {},
        },
      },
    }, 'scratch')
    cardStore.activeCardId = cardId

    const card = cardStore.getCard(cardId)
    expect(card).toBeDefined()
    cardStore.updateCard(cardId, {
      ...card!,
      extensions: {
        ...card!.extensions,
        airi: {
          ...card!.extensions.airi,
          modules: {
            ...card!.extensions.airi.modules,
            displayModelId: 'preset-vrm-1',
          },
        },
      },
    })

    expect(stageModelStore.stageModelSelected).toBe('preset-vrm-1')
  })

  // ROOT CAUSE:
  //
  // The settings reset clears the runtime model before resetting card state.
  // Resetting `activeCardId` first briefly selected the still-persisted default
  // card, allowing its display model to overwrite the reset runtime value.
  //
  // https://github.com/moeru-ai/airi/pull/2090#discussion_r3610810272
  it('does not restore a stale card model during card state reset', () => {
    const stageModelStore = useSettingsStageModel()
    stageModelStore.stageModelSelected = 'preset-live2d-1'

    const cardStore = useAiriCardStore()
    cardStore.initialize()
    cardStore.updateActiveCardDisplayModel('preset-vrm-1')
    stageModelStore.stageModelSelected = 'preset-live2d-1'

    cardStore.resetState()

    expect(stageModelStore.stageModelSelected).toBe('preset-live2d-1')
  })

  /**
   * @example
   * it('updates speech config on the active card', () => {})
   */
  it('updates speech config on the active card', () => {
    const cardStore = useAiriCardStore()
    cardStore.initialize()

    expect(cardStore.updateActiveCardSpeech({ provider: 'elevenlabs', model: 'eleven_multilingual_v2', voice_id: 'aria' })).toBe(true)
    expect(cardStore.activeCard?.extensions.airi.modules.speech).toMatchObject({
      provider: 'elevenlabs',
      model: 'eleven_multilingual_v2',
      voice_id: 'aria',
    })
  })
})
