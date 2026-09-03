import type { AiriCard } from './airi-card'

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { splitCard } from '../../libs/character-card-sync'
import { useProviderStore } from '../providers/provider'
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

vi.mock('./vision', async () => {
  const { defineStore } = await import('pinia')

  return {
    useVisionStore: defineStore('vision', {
      state: () => ({
        activeProvider: 'mock-vision-provider',
        activeModel: 'mock-vision-model',
      }),
      actions: {
        resetModelSelection() {
          this.activeModel = ''
        },
        // The real action loads the catalog into the provider store. Each test
        // writes that catalog state itself.
        async loadModelsForProvider() {},
      },
    }),
  }
})

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

describe('airi-card store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetArtistryToGlobal.mockClear()
    useSpeechStore().$patch({
      activeSpeechProvider: 'mock-speech-provider',
      activeSpeechModel: 'mock-speech-model',
      activeSpeechVoiceId: 'mock-speech-voice',
    })
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

  it('preserves ambiguous old default speech settings', async () => {
    const cardStore = useAiriCardStore()
    cardStore.cards.set('default', {
      name: 'ReLU',
      version: '1.0.0',
      description: 'Built-in card from before provider defaults loaded.',
      extensions: {
        airi: {
          avatarModels: [],
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
      provider: 'speech-noop',
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
          avatarModels: [{
            id: 'vrm-avatar-model',
            displayModelId: 'preset-vrm-1',
            type: 'vrm',
            config: {},
          }],
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
          avatarModels: [{
            id: 'live2d-avatar-model',
            displayModelId: 'preset-live2d-1',
            type: 'live2d',
            config: {
              controls: {
                disabledExpressions: [],
                disabledMotions: [],
              },
            },
          }],
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

    expect(await cardStore.setActiveCardDefaultAvatarModel('preset-vrm-1')).toBe(true)
    expect(await cardStore.updateActiveCardConsciousness({ provider: 'openrouter-ai', model: 'anthropic/claude-sonnet' })).toBe(true)
    expect(await cardStore.updateActiveCardVision({ provider: 'ollama', model: 'llava' })).toBe(true)
    expect(await cardStore.updateActiveCardSpeech({ provider: 'elevenlabs', model: 'eleven_multilingual_v2', voice_id: 'aria' })).toBe(true)
    expect(cardStore.activeCard?.extensions.airi.modules).toMatchObject({
      displayModelId: 'preset-vrm-1',
      consciousness: { provider: 'openrouter-ai', model: 'anthropic/claude-sonnet' },
      vision: { provider: 'ollama', model: 'llava' },
      speech: { provider: 'elevenlabs', model: 'eleven_multilingual_v2', voice_id: 'aria' },
    })
    expect(cardStore.selectedAvatarModel).toMatchObject({
      displayModelId: 'preset-vrm-1',
      type: 'vrm',
    })
    expect(cardStore.activeCard?.extensions.airi.defaultAvatarModelId).toBe(cardStore.selectedAvatarModelId)
    expect(stageModelStore.stageModelSelected).toBe('preset-vrm-1')
  })

  // ROOT CAUSE:
  //
  // Selecting Apple Vision stored an empty model on the card before the catalog
  // loaded. The catalog default changed only the runtime model, so applying the
  // card again restored the empty model.
  //
  // We fixed this by storing the catalog default on the card.
  it('keeps the catalog default of a selected vision provider when the card applies again', async () => {
    const cardStore = useAiriCardStore()
    await cardStore.initialize()
    useProviderStore().providerRuntimeState = {
      'apple-vision': { models: [], defaultModel: 'system', modelStatus: 'ready', modelError: null },
    }

    expect(await cardStore.selectActiveCardVisionProvider('apple-vision')).toBe(true)
    expect(cardStore.activeCard?.extensions.airi.modules.vision).toEqual({ provider: 'apple-vision', model: 'system' })

    await cardStore.activateCard(cardStore.activeCardId)

    expect(useVisionStore()).toMatchObject({ activeProvider: 'apple-vision', activeModel: 'system' })
  })

  // ROOT CAUSE:
  //
  // The Character stored the selected Display Model and its Avatar Model
  // reference. The runtime Avatar Model ID was not durable. A new runtime
  // selected the first Avatar Model instead of the Character default.
  //
  // We fixed this by storing the default Avatar Model ID on the Character.
  // Initialization now restores that ID into the runtime selection.
  it('restores the Character default Avatar Model after a runtime restart', async () => {
    const cardStore = useAiriCardStore()
    await cardStore.initialize()
    await cardStore.setActiveCardDefaultAvatarModel('preset-vrm-1')

    const expectedAvatarModelId = cardStore.selectedAvatarModelId
    const persistedCards = new Map(cardStore.cards)

    setActivePinia(createPinia())

    const restartedStageModelStore = useSettingsStageModel()
    const restartedCardStore = useAiriCardStore()
    restartedCardStore.$patch({ cards: persistedCards })
    await restartedCardStore.initialize()

    expect(restartedCardStore.selectedAvatarModelId).toBe(expectedAvatarModelId)
    expect(restartedStageModelStore.stageModelSelected).toBe('preset-vrm-1')
  })

  it('promotes the configured Display Model when stored Character data has no default Avatar Model ID', async () => {
    const cardStore = useAiriCardStore()
    cardStore.$patch({
      cards: new Map([['default', {
        name: 'ReLU',
        version: '1.0.0',
        description: 'Stored before the default Avatar Model field existed.',
        extensions: {
          airi: {
            avatarModels: [{
              id: 'default-live2d-avatar-model',
              displayModelId: 'preset-live2d-1',
              type: 'live2d',
              config: {
                controls: {
                  disabledExpressions: [],
                  disabledMotions: [],
                },
              },
            }, {
              id: 'configured-vrm-avatar-model',
              displayModelId: 'preset-vrm-1',
              type: 'vrm',
              config: {},
            }],
            modules: {
              consciousness: { provider: '', model: '' },
              vision: { provider: '', model: '' },
              speech: { provider: '', model: '', voice_id: '' },
              displayModelId: 'preset-vrm-1',
            },
            agents: {},
          },
        },
      } satisfies AiriCard]]),
    })

    await cardStore.initialize()

    expect(cardStore.activeCard?.extensions.airi.defaultAvatarModelId).toBe('configured-vrm-avatar-model')
    expect(cardStore.selectedAvatarModelId).toBe('configured-vrm-avatar-model')
    expect(useSettingsStageModel().stageModelSelected).toBe('preset-vrm-1')
  })

  it('keeps the runtime model empty when a Character has no default Avatar Model', async () => {
    const cardStore = useAiriCardStore()
    const cardId = await cardStore.addCard({
      name: 'Model optional',
      version: '1.0.0',
      description: 'This Character does not select a default Avatar Model.',
      extensions: {
        airi: {
          avatarModels: [{
            id: 'available-vrm-avatar-model',
            displayModelId: 'preset-vrm-1',
            type: 'vrm',
            config: {},
          }],
          modules: {
            consciousness: { provider: '', model: '' },
            vision: { provider: '', model: '' },
            speech: { provider: '', model: '', voice_id: '' },
          },
          agents: {},
        },
      },
    }, 'scratch')
    cardStore.activeCardId = cardId

    await cardStore.initialize()

    expect(cardStore.activeCard?.extensions.airi.defaultAvatarModelId).toBeUndefined()
    expect(cardStore.selectedAvatarModelId).toBeUndefined()
    expect(useSettingsStageModel().stageModelSelected).toBe('')
  })

  it('stores Live2D control policy on the selected Avatar Model', async () => {
    const stageModelStore = useSettingsStageModel()
    const cardStore = useAiriCardStore()
    await cardStore.initialize()

    const avatarModelId = cardStore.selectedAvatarModelId
    expect(avatarModelId).toBe('default-live2d-avatar-model')

    await expect(cardStore.updateLive2DControlPolicy('default', avatarModelId!, {
      disabledExpressions: ['05_Angry'],
      disabledMotions: ['motions/哭哭.motion3.json'],
    })).resolves.toBe(true)

    expect(cardStore.selectedAvatarModel).toMatchObject({
      config: {
        controls: {
          disabledExpressions: ['05_Angry'],
          disabledMotions: ['motions/哭哭.motion3.json'],
        },
      },
    })
    await cardStore.selectAvatarModel(undefined)
    expect(cardStore.selectedAvatarModelId).toBeUndefined()
    expect(stageModelStore.stageModelSelected).toBe('')
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
          avatarModels: [{
            id: 'vrm-avatar-model',
            displayModelId: 'preset-vrm-1',
            type: 'vrm',
            config: {},
          }],
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
          avatarModels: [{
            id: 'editable-avatar-model',
            displayModelId: 'preset-live2d-1',
            type: 'live2d',
            config: {
              controls: {
                disabledExpressions: [],
                disabledMotions: [],
              },
            },
          }],
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
          avatarModels: [{
            id: 'editable-avatar-model',
            displayModelId: 'preset-vrm-1',
            type: 'vrm',
            config: {},
          }],
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
    await cardStore.setActiveCardDefaultAvatarModel('preset-vrm-1')
    stageModelStore.stageModelSelected = 'preset-live2d-1'

    cardStore.resetState()

    expect(stageModelStore.stageModelSelected).toBe('preset-live2d-1')
  })

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

  it('adds only enabled Live2D controls to the ACT prompt', async () => {
    const cardStore = useAiriCardStore()
    await cardStore.initialize()

    cardStore.activeLive2DModelControls = {
      expressions: [
        { name: '05_Angry', fileName: 'expressions/05_Angry.exp3.json' },
        { name: '08_EyeCheerful', fileName: 'expressions/08_EyeCheerful.exp3.json' },
      ],
      motions: [
        { fileName: 'motions/哭哭.motion3.json', group: 'AIRI', index: 0 },
        { fileName: 'motions/疑惑.motion3.json', group: 'AIRI', index: 1 },
      ],
    }
    await cardStore.updateLive2DControlPolicy('default', cardStore.selectedAvatarModelId!, {
      disabledExpressions: ['05_Angry'],
      disabledMotions: ['motions/哭哭.motion3.json'],
    })

    expect(cardStore.systemPrompt).toContain('"08_EyeCheerful"')
    expect(cardStore.systemPrompt).toContain('"motions/疑惑.motion3.json"')
    expect(cardStore.systemPrompt).toContain('<|ACT {"expression":{"name":"08_EyeCheerful","duration":3}}|>')
    expect(cardStore.systemPrompt).toContain('<|ACT {"expression":null}|>')
    expect(cardStore.systemPrompt).not.toContain('"05_Angry"')
    expect(cardStore.systemPrompt).not.toContain('"motions/哭哭.motion3.json"')
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

  it('preserves a valid runtime Character selection during initialization', async () => {
    const cardStore = useAiriCardStore()
    const cardId = await cardStore.addCard({
      name: 'Selected Character',
      version: '1.0.0',
      description: 'Keep this selection.',
    }, 'scratch')
    cardStore.activeCardId = cardId

    await cardStore.initialize()

    expect(cardStore.activeCardId).toBe(cardId)
    expect(cardStore.activeCard?.name).toBe('Selected Character')
  })

  it('repairs a dangling runtime Character selection during initialization', async () => {
    const cardStore = useAiriCardStore()
    cardStore.activeCardId = 'missing-card'

    await cardStore.initialize()

    expect(cardStore.activeCardId).toBe('default')
    expect(cardStore.activeCard?.name).toBe('ReLU')
  })

  describe('applySynchronizedCards', () => {
    const noChanges = { upserts: {}, removals: [], conflictCopies: [] }

    it('stores a card from another device without a local change to its parts', async () => {
      const cardStore = useAiriCardStore()
      await cardStore.initialize()
      const remoteParts = splitCard({ ...cardStore.builtInCard, name: 'Luna' })

      const { activeCardChanged, rejected } = cardStore.applySynchronizedCards({ ...noChanges, upserts: { luna: remoteParts } })

      expect(activeCardChanged).toBe(false)
      expect(rejected).toEqual([])
      expect(splitCard(cardStore.cards.get('luna')!)).toEqual(remoteParts)
    })

    it('reports a change to the content of the selected card', async () => {
      const cardStore = useAiriCardStore()
      await cardStore.initialize()
      const parts = splitCard({ ...cardStore.builtInCard, name: 'Luna' })

      const { activeCardChanged } = cardStore.applySynchronizedCards({ ...noChanges, upserts: { default: parts } })

      expect(activeCardChanged).toBe(true)
      expect(cardStore.activeCardId).toBe('default')
    })

    it('selects the built-in card when another device deleted the selected card', async () => {
      const cardStore = useAiriCardStore()
      await cardStore.initialize()
      const cardId = await cardStore.addCard({ name: 'Luna', version: '1.0.0' }, 'scratch')
      await cardStore.activateCard(cardId)

      const { activeCardChanged } = cardStore.applySynchronizedCards({ ...noChanges, removals: [cardId, 'default'] })

      expect(activeCardChanged).toBe(true)
      expect(cardStore.cards.has(cardId)).toBe(false)
      expect(cardStore.cards.has('default')).toBe(true)
      expect(cardStore.activeCardId).toBe('default')
    })

    it('keeps a conflict copy as a new card', async () => {
      const cardStore = useAiriCardStore()
      await cardStore.initialize()
      const fields = splitCard({ ...cardStore.builtInCard, name: 'Luna', description: 'Local version' })

      cardStore.applySynchronizedCards({ ...noChanges, conflictCopies: [{ documentId: 'luna', fields }] })

      const copies = [...cardStore.cards].filter(([id]) => id !== 'default')
      expect(copies).toHaveLength(1)
      expect(copies[0][1].description).toBe('Local version')
      expect(copies[0][1].name).toBe('settings.pages.card.sync.conflict_copy_name')
    })

    // A card from another device can break the parser of this device. The run
    // must go on with the other cards and report the card as rejected.
    it.each([
      ['has no name', { '/description': 'No name' }],
      ['has wake words that are not a list', { '/name': 'Luna', '/version': '1.0.0', '/extensions/airi/wakeWords': 'not a list' }],
    ])('rejects a card from another device that %s and applies the others', async (_, brokenFields) => {
      const cardStore = useAiriCardStore()
      await cardStore.initialize()
      const goodFields = splitCard({ ...cardStore.builtInCard, name: 'Luna' })

      const { rejected } = cardStore.applySynchronizedCards({ ...noChanges, upserts: { broken: brokenFields, luna: goodFields } })

      expect(rejected).toEqual(['broken'])
      expect(cardStore.cards.has('broken')).toBe(false)
      expect(cardStore.cards.get('luna')?.name).toBe('Luna')
    })

    // Found in the review of https://github.com/moeru-ai/airi/pull/2817
    // ROOT CAUSE:
    //
    // The store rejected an unreadable remote card but still made its conflict
    // copy. The sync state did not change, so each round made one more copy.
    //
    // We fixed this by making copies only for cards that were not rejected.
    it('creates no conflict copy for a card that it rejects', async () => {
      const cardStore = useAiriCardStore()
      await cardStore.initialize()
      const cardId = await cardStore.addCard({ name: 'Luna', version: '1.0.0', description: 'Local version' }, 'scratch')
      const localFields = splitCard(cardStore.cards.get(cardId)!)

      const { rejected } = cardStore.applySynchronizedCards({
        upserts: { [cardId]: { '/description': 'No name' } },
        removals: [],
        conflictCopies: [{ documentId: cardId, fields: localFields }],
      })

      expect(rejected).toEqual([cardId])
      expect([...cardStore.cards.keys()]).toEqual(['default', cardId])
      expect(cardStore.cards.get(cardId)?.description).toBe('Local version')
    })

    // Found in the review of https://github.com/moeru-ai/airi/pull/2817
    // ROOT CAUSE:
    //
    // An unreadable copy threw after the upsert replaced the local card. The
    // next run found no conflict, so the local edit was lost.
    //
    // We fixed this by reading every card before the first write.
    it('keeps the local card when its conflict copy cannot be read', async () => {
      const cardStore = useAiriCardStore()
      await cardStore.initialize()
      const cardId = await cardStore.addCard({ name: 'Luna', version: '1.0.0', description: 'Local version' }, 'scratch')
      const remoteFields = splitCard({ ...cardStore.cards.get(cardId)!, description: 'Remote version' })

      const { rejected } = cardStore.applySynchronizedCards({
        upserts: { [cardId]: remoteFields },
        removals: [],
        conflictCopies: [{ documentId: cardId, fields: { '/description': 'No name' } }],
      })

      expect(rejected).toEqual([cardId])
      expect([...cardStore.cards.keys()]).toEqual(['default', cardId])
      expect(cardStore.cards.get(cardId)?.description).toBe('Local version')
    })

    // Each device creates the built-in card in its own language. Only the edits travel between devices.
    describe('the built-in card', () => {
      it('shows the built-in parts that the remote edits do not replace', async () => {
        const cardStore = useAiriCardStore()
        await cardStore.initialize()
        const builtInDescription = cardStore.cards.get('default')?.description

        const { rejected } = cardStore.applySynchronizedCards({ ...noChanges, upserts: { default: { '/systemPrompt': 'Be kind' } } })

        expect(rejected).toEqual([])
        expect(cardStore.cards.get('default')).toMatchObject({ name: 'ReLU', description: builtInDescription, systemPrompt: 'Be kind' })
      })

      // Every device ships the preset Avatar Model. Its reference is built-in content, not an edit.
      it('sends no parts for the preset Avatar Model of an unedited built-in card', async () => {
        const cardStore = useAiriCardStore()
        await cardStore.initialize()

        expect(splitCard(cardStore.cards.get('default')!, [cardStore.builtInCard])).toEqual({})
      })

      it('keeps the preset Avatar Model when the remote edits do not replace it', async () => {
        const cardStore = useAiriCardStore()
        await cardStore.initialize()

        cardStore.applySynchronizedCards({ ...noChanges, upserts: { default: { '/systemPrompt': 'Be kind' } } })

        expect(cardStore.cards.get('default')?.extensions.airi.defaultAvatarModelId).toBe('default-live2d-avatar-model')
        expect(cardStore.cards.get('default')?.extensions.airi.avatarModels).toEqual([
          expect.objectContaining({ id: 'default-live2d-avatar-model', displayModelId: 'preset-live2d-1' }),
        ])
      })

      it('goes back to the built-in part when the remote edit is gone', async () => {
        const cardStore = useAiriCardStore()
        await cardStore.initialize()
        cardStore.applySynchronizedCards({ ...noChanges, upserts: { default: { '/systemPrompt': 'Be kind' } } })

        cardStore.applySynchronizedCards({ ...noChanges, upserts: { default: {} } })

        expect(cardStore.cards.get('default')?.systemPrompt).toBeUndefined()
      })

      it('keeps the edits of the built-in card as a complete conflict copy', async () => {
        const cardStore = useAiriCardStore()
        await cardStore.initialize()

        cardStore.applySynchronizedCards({ ...noChanges, conflictCopies: [{ documentId: 'default', fields: { '/systemPrompt': 'Mine' } }] })

        const [copy] = [...cardStore.cards].filter(([id]) => id !== 'default')
        expect(copy[1]).toMatchObject({ description: cardStore.cards.get('default')?.description, systemPrompt: 'Mine' })
      })
    })
  })
})
