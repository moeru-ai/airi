import type { AiriCard } from './airi-card'

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useSettingsStageModel } from '../settings/stage-model'
import { useAiriCardStore } from './airi-card'
import { useConsciousnessStore } from './consciousness'
import { useSpeechStore } from './speech'
import { useVisionStore } from './vision'

const { resetArtistryToGlobal } = vi.hoisted(() => ({
  resetArtistryToGlobal: vi.fn(),
}))

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
        resetToGlobal: resetArtistryToGlobal,
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
    resetArtistryToGlobal.mockClear()
  })

  // ROOT CAUSE:
  //
  // Authentication installed the official module defaults before card startup
  // completed. Initializing the default card then assigned its missing module
  // fields as empty values and erased those defaults.
  //
  // We fixed this by applying only module fields that a card actually owns.
  it('keeps runtime module selections when the active card omits them', async () => {
    const consciousnessStore = useConsciousnessStore()
    const speechStore = useSpeechStore()
    const visionStore = useVisionStore()
    const cardStore = useAiriCardStore()

    await cardStore.initialize()

    expect(consciousnessStore.activeProvider).toBe('mock-consciousness-provider')
    expect(consciousnessStore.activeModel).toBe('mock-consciousness-model')
    expect(speechStore.activeSpeechProvider).toBe('mock-speech-provider')
    expect(speechStore.activeSpeechModel).toBe('mock-speech-model')
    expect(speechStore.activeSpeechVoiceId).toBe('mock-speech-voice')
    expect(visionStore.activeProvider).toBe('mock-vision-provider')
    expect(visionStore.activeModel).toBe('mock-vision-model')
  })

  // ROOT CAUSE:
  //
  // The default card took a snapshot before sign-in. Its speech provider was
  // `speech-noop`, so a later activation replaced the official speech provider.
  // The card then showed missing module settings instead of inherited settings.
  //
  // We fix this by keeping the default card module fields empty. Empty fields
  // inherit the global module settings and never replace them during activation.
  it('keeps default card modules inherited after authenticated defaults load', async () => {
    const consciousnessStore = useConsciousnessStore()
    const speechStore = useSpeechStore()
    const visionStore = useVisionStore()
    const cardStore = useAiriCardStore()

    consciousnessStore.activeProvider = ''
    consciousnessStore.activeModel = ''
    speechStore.activeSpeechProvider = 'speech-noop'
    speechStore.activeSpeechModel = ''
    speechStore.activeSpeechVoiceId = ''
    visionStore.activeProvider = ''
    visionStore.activeModel = ''

    await cardStore.initialize()

    consciousnessStore.activeProvider = 'official-provider'
    consciousnessStore.activeModel = 'auto'
    speechStore.activeSpeechProvider = 'official-provider-speech'
    speechStore.activeSpeechModel = 'auto'
    visionStore.activeProvider = 'vision-official-provider'
    visionStore.activeModel = 'auto'

    await cardStore.activateCard('default')

    expect(cardStore.activeCard?.extensions.airi.modules.consciousness).toEqual({
      provider: '',
      model: '',
    })
    expect(cardStore.activeCard?.extensions.airi.modules.speech).toMatchObject({
      provider: '',
      model: '',
      voice_id: '',
    })
    expect(cardStore.activeCard?.extensions.airi.modules.vision).toEqual({
      provider: '',
      model: '',
    })
    expect(consciousnessStore.activeProvider).toBe('official-provider')
    expect(consciousnessStore.activeModel).toBe('auto')
    expect(speechStore.activeSpeechProvider).toBe('official-provider-speech')
    expect(speechStore.activeSpeechModel).toBe('auto')
    expect(visionStore.activeProvider).toBe('vision-official-provider')
    expect(visionStore.activeModel).toBe('auto')
  })

  it('migrates the old default speech placeholder to inherited settings', async () => {
    const cardStore = useAiriCardStore()
    cardStore.cards.set('default', {
      name: 'ReLU',
      version: '1.0.0',
      description: 'Built-in card from before provider defaults loaded.',
      extensions: {
        airi: {
          modules: {
            consciousness: { provider: '', model: '' },
            speech: { provider: 'speech-noop', model: '', voice_id: '' },
            vision: { provider: '', model: '' },
          },
          agents: {},
        },
      },
    })

    await cardStore.initialize()

    expect(cardStore.activeCard?.extensions.airi.modules.speech).toMatchObject({
      provider: '',
      model: '',
      voice_id: '',
    })
  })

  // ROOT CAUSE:
  //
  // Each Electron window called the synchronized initialize action. The leader
  // applied the active card again for every new window. An older card selection
  // then replaced module defaults that the authentication hook had configured.
  //
  // We fixed this by making card initialization idempotent in the leader.
  it('does not reapply active card settings for a second window', async () => {
    const consciousnessStore = useConsciousnessStore()
    const speechStore = useSpeechStore()
    const visionStore = useVisionStore()
    const cardStore = useAiriCardStore()
    await cardStore.initialize()

    consciousnessStore.activeProvider = 'official-provider'
    consciousnessStore.activeModel = 'auto'
    speechStore.activeSpeechProvider = 'official-provider-speech'
    speechStore.activeSpeechModel = 'auto'
    visionStore.activeProvider = 'vision-official-provider'
    visionStore.activeModel = 'auto'

    await cardStore.initialize()

    expect(consciousnessStore.activeProvider).toBe('official-provider')
    expect(consciousnessStore.activeModel).toBe('auto')
    expect(speechStore.activeSpeechProvider).toBe('official-provider-speech')
    expect(speechStore.activeSpeechModel).toBe('auto')
    expect(visionStore.activeProvider).toBe('vision-official-provider')
    expect(visionStore.activeModel).toBe('auto')
  })

  // ROOT CAUSE:
  //
  // A synchronized state snapshot replaced `activeCardId`. The old watcher
  // interpreted that replicated state as a user command and applied module
  // settings, which produced another synchronized snapshot.
  //
  // We fixed this by applying settings only from the synchronized activation
  // action. State replication remains free of runtime side effects.
  it('applies card settings only through the activation command', async () => {
    const stageModelStore = useSettingsStageModel()
    const cardStore = useAiriCardStore()
    await cardStore.initialize()

    const vrmCardId = await cardStore.addCard({
      name: 'VRM card',
      version: '1.0.0',
      description: 'Card for the promoted leader.',
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
    }, 'scratch')
    const live2dCardId = await cardStore.addCard({
      name: 'Live2D card',
      version: '1.0.0',
      description: 'Card for the active leader.',
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

    stageModelStore.stageModelSelected = 'preset-live2d-1'
    await cardStore.activateCard(vrmCardId)
    expect(stageModelStore.stageModelSelected).toBe('preset-vrm-1')

    cardStore.$patch({ activeCardId: live2dCardId })
    expect(stageModelStore.stageModelSelected).toBe('preset-vrm-1')

    await cardStore.activateCard(live2dCardId)
    expect(stageModelStore.stageModelSelected).toBe('preset-live2d-1')
  })

  it('does not create runtime module stores for metadata-only consumers', () => {
    const pinia = createPinia()
    setActivePinia(pinia)

    // ROOT CAUSE:
    //
    // The chat session store only reads the active card ID and system prompt,
    // but creating the card store also created every runtime module store.
    // The speech store then loaded provider voices in each auxiliary window.
    useAiriCardStore(pinia)

    expect(pinia.state.value.speech).toBeUndefined()
    expect(pinia.state.value.consciousness).toBeUndefined()
    expect(pinia.state.value.vision).toBeUndefined()
  })

  /**
   * @example
   * it('persists selected module config on active card', () => {})
   */
  it('persists selected module config on active card', async () => {
    const stageModelStore = useSettingsStageModel()
    stageModelStore.stageModelSelected = 'preset-live2d-1'

    const cardStore = useAiriCardStore()
    await cardStore.initialize()

    expect(await cardStore.updateActiveCardDisplayModel('display-model-iru-v2')).toBe(true)
    expect(await cardStore.updateActiveCardConsciousness({ provider: 'openrouter-ai', model: 'anthropic/claude-sonnet' })).toBe(true)
    expect(await cardStore.updateActiveCardVision({ provider: 'ollama', model: 'llava' })).toBe(true)
    expect(await cardStore.updateActiveCardSpeech({ provider: 'elevenlabs', model: 'eleven_multilingual_v2', voice_id: 'aria' })).toBe(true)
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
  it('issue #2089: applies the activated card display model to the stage runtime', async () => {
    const stageModelStore = useSettingsStageModel()
    stageModelStore.stageModelSelected = 'preset-live2d-1'

    const cardStore = useAiriCardStore()
    await cardStore.initialize()

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
    const cardId = await cardStore.addCard(card, 'scratch')

    await cardStore.activateCard(cardId)

    expect(stageModelStore.stageModelSelected).toBe('preset-vrm-1')
  })

  it('applies edits to the currently active card display model', async () => {
    const stageModelStore = useSettingsStageModel()
    stageModelStore.stageModelSelected = 'preset-live2d-1'

    const cardStore = useAiriCardStore()
    await cardStore.initialize()

    const cardId = await cardStore.addCard({
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
    await cardStore.activateCard(cardId)

    const card = cardStore.getCard(cardId)
    expect(card).toBeDefined()
    await cardStore.updateCard(cardId, {
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
  // pinia-plugin-synced applies a structured clone of every synchronized
  // store. The clone replaced the active card object, so the runtime watcher
  // treated unchanged card settings as an edit. Applying those settings
  // mutated other synchronized stores and committed another full snapshot.
  //
  // We prevent the feedback loop by applying runtime settings only through an
  // explicit card command, never in response to a state snapshot.
  it('does not reapply runtime settings for an unchanged synchronized card snapshot', async () => {
    const cardStore = useAiriCardStore()
    await cardStore.initialize()

    const cardId = await cardStore.addCard({
      name: 'Artistry card',
      version: '1.0.0',
      description: 'A card with object-valued runtime settings.',
      extensions: {
        airi: {
          modules: {
            artistry: {
              options: { steps: 20 },
            },
          },
          agents: {},
        },
      },
    }, 'scratch')
    await cardStore.activateCard(cardId)

    const applicationsBeforeSnapshot = resetArtistryToGlobal.mock.calls.length
    const synchronizedCards = new Map<string, AiriCard>(JSON.parse(JSON.stringify([...cardStore.cards])))

    cardStore.$patch({ cards: synchronizedCards })

    expect(resetArtistryToGlobal).toHaveBeenCalledTimes(applicationsBeforeSnapshot)
  })

  // ROOT CAUSE:
  //
  // The settings reset clears the runtime model before resetting card state.
  // Resetting `activeCardId` first briefly selected the still-persisted default
  // card, allowing its display model to overwrite the reset runtime value.
  //
  // https://github.com/moeru-ai/airi/pull/2090#discussion_r3610810272
  it('does not restore a stale card model during card state reset', async () => {
    const stageModelStore = useSettingsStageModel()
    stageModelStore.stageModelSelected = 'preset-live2d-1'

    const cardStore = useAiriCardStore()
    await cardStore.initialize()
    await cardStore.updateActiveCardDisplayModel('preset-vrm-1')
    stageModelStore.stageModelSelected = 'preset-live2d-1'

    cardStore.resetState()

    expect(stageModelStore.stageModelSelected).toBe('preset-live2d-1')
  })

  /**
   * @example
   * it('updates speech config on the active card', () => {})
   */
  it('updates speech config on the active card', async () => {
    const cardStore = useAiriCardStore()
    await cardStore.initialize()

    expect(await cardStore.updateActiveCardSpeech({ provider: 'elevenlabs', model: 'eleven_multilingual_v2', voice_id: 'aria' })).toBe(true)
    expect(cardStore.activeCard?.extensions.airi.modules.speech).toMatchObject({
      provider: 'elevenlabs',
      model: 'eleven_multilingual_v2',
      voice_id: 'aria',
    })
  })

  it('keeps position-sensitive CCv3 fields separate from the stable system prompt', async () => {
    const cardStore = useAiriCardStore()
    await cardStore.initialize()

    const cardId = await cardStore.addCard({
      name: 'Runtime context card',
      version: '1.0.0',
      systemPrompt: 'Follow the character rules.',
      description: 'A patient field researcher.',
      personality: 'Curious and precise.',
      scenario: 'The conversation takes place in an observatory.',
      postHistoryInstructions: 'Answer the latest observation in one paragraph.',
      greetings: ['Welcome to the observatory.'],
      messageExample: [
        ['{{user}}: What did you find?', '{{char}}: A new comet.'],
      ],
      extensions: {
        airi: {
          modules: {
            consciousness: { provider: 'mock-consciousness-provider', model: 'mock-consciousness-model' },
            vision: { provider: 'mock-vision-provider', model: 'mock-vision-model' },
            speech: { provider: 'mock-speech-provider', model: 'mock-speech-model', voice_id: 'mock-speech-voice' },
            artistry: { widgetInstruction: 'Use the image widget for star charts.' },
          },
          agents: {},
        },
      },
    }, 'scratch')

    await cardStore.activateCard(cardId)

    expect(cardStore.systemPrompt).toBe([
      'Follow the character rules.',
      'A patient field researcher.',
      'Curious and precise.',
      'The conversation takes place in an observatory.',
      'Use the image widget for star charts.',
    ].join('\n\n'))
    expect(cardStore.systemPrompt).not.toContain('Answer the latest observation')
    expect(cardStore.systemPrompt).not.toContain('Welcome to the observatory')
    expect(cardStore.systemPrompt).not.toContain('What did you find?')
  })

  it('falls back to the default card when the active custom card is deleted', async () => {
    const cardStore = useAiriCardStore()
    await cardStore.initialize()

    const cardId = await cardStore.addCard({
      name: 'Custom card',
      version: '1.0.0',
      description: 'A removable card.',
    }, 'scratch')
    await cardStore.activateCard(cardId)

    await cardStore.removeCard(cardId)

    expect(cardStore.cards.has(cardId)).toBe(false)
    expect(cardStore.activeCardId).toBe('default')
    expect(cardStore.activeCard?.name).toBe('ReLU')
  })

  it('keeps the built-in fallback card when deletion is requested directly', async () => {
    const cardStore = useAiriCardStore()
    await cardStore.initialize()

    expect(await cardStore.removeCard('default')).toBe(false)
    expect(cardStore.cards.has('default')).toBe(true)
    expect(cardStore.activeCardId).toBe('default')
  })

  it('preserves a valid persisted active card during initialization', async () => {
    const cardStore = useAiriCardStore()
    const cardId = await cardStore.addCard({
      name: 'Persisted active card',
      version: '1.0.0',
      description: 'Keep this selection.',
    }, 'scratch')
    cardStore.activeCardId = cardId

    await cardStore.initialize()

    expect(cardStore.activeCardId).toBe(cardId)
    expect(cardStore.activeCard?.name).toBe('Persisted active card')
  })

  it('repairs a dangling persisted active card during initialization', async () => {
    const cardStore = useAiriCardStore()
    cardStore.activeCardId = 'missing-card'

    await cardStore.initialize()

    expect(cardStore.activeCardId).toBe('default')
    expect(cardStore.activeCard?.name).toBe('ReLU')
  })
})
