import type { Card, ccv3 } from '@proj-airi/ccc'

import type { AiriCard, AiriExtension } from '../../types/airiCard'

import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import SystemPromptV2 from '../../constants/prompts/system-v2'

import { DEFAULT_ARTISTRY_WIDGET_SPAWNING_PROMPT } from '../../constants/prompts/character-defaults'
import { captureAnalyticsEvent } from '../../libs/analytics'
import { useSettingsStageModel } from '../settings/stage-model'
import { useArtistryStore } from './artistry'
import { useConsciousnessStore } from './consciousness'
import { useSpeechStore } from './speech'
import { useVisionStore } from './vision'

export type { AiriCard, AiriExtension } from '../../types/airiCard'

function resolveSystemPrompt(card: AiriCard | undefined): string {
  if (!card)
    return ''

  // Position-sensitive CCv3 fields are deliberately excluded until provider
  // message assembly owns their ordering and role semantics.
  const systemPromptParts = [
    card.systemPrompt,
    card.description,
    card.personality,
    card.scenario,
    card.extensions.airi.modules.artistry?.widgetInstruction,
  ].filter((part): part is string => typeof part === 'string' && part.trim().length > 0)

  return systemPromptParts.join('\n\n')
}

export const useAiriCardStore = defineStore('airi-card', () => {
  const { t } = useI18n()

  // Pinia synchronization owns cross-window updates. Local storage only loads
  // and saves this renderer's durable copy; listening to storage events here
  // would create a second cross-window state channel and echo cloned maps.
  const cards = useLocalStorageManualReset<Map<string, AiriCard>>('airi-cards', new Map(), { listenToStorageChanges: false })
  const activeCardId = useLocalStorageManualReset<string>('airi-card-active-id', 'default', { listenToStorageChanges: false })
  let initialized = false

  const activeCard = computed(() => cards.value.get(activeCardId.value))
  function useRuntimeModuleStores() {
    return {
      artistry: useArtistryStore(),
      consciousness: useConsciousnessStore(),
      speech: useSpeechStore(),
      stageModel: useSettingsStageModel(),
      vision: useVisionStore(),
    }
  }

  /**
   * `source` feeds the `card_created` analytics event: `scratch` = built in
   * the creation dialog, `import` = ccv3 JSON upload, `duplicate` = cloned
   * from an existing card (profile switcher). Required so a new call site
   * can't silently degrade creation attribution.
   */
  const addCard = async (card: AiriCard | Card | ccv3.CharacterCardV3, source: 'duplicate' | 'import' | 'scratch') => {
    const newCardId = nanoid()
    cards.value.set(newCardId, newAiriCard(card))
    captureAnalyticsEvent('card_created', { card_id: newCardId, source })
    return newCardId
  }

  const removeCard = async (id: string) => {
    // The built-in card is the guaranteed fallback for every runtime profile.
    if (id === 'default')
      return false

    const removed = cards.value.delete(id)
    if (!removed)
      return false

    // The active id is persisted independently from the card map. Reset it
    // before consumers observe a dangling runtime profile after deletion.
    if (activeCardId.value === id) {
      activeCardId.value = 'default'
      applyActiveCardSettings()
    }

    captureAnalyticsEvent('character_deleted', { character_id: id })
    return true
  }

  const updateCard = async (id: string, updates: AiriCard | Card | ccv3.CharacterCardV3) => {
    const existingCard = cards.value.get(id)
    if (!existingCard)
      return false

    const updatedCard = {
      ...existingCard,
      ...updates,
    }

    const card = newAiriCard(updatedCard)
    cards.value.set(id, card)
    if (id === activeCardId.value)
      applyActiveCardSettings(card)

    return true
  }

  const getCard = (id: string) => {
    return cards.value.get(id)
  }

  function updateActiveCardModules(patch: (extension: AiriExtension) => Partial<AiriExtension['modules']>) {
    const cardId = activeCardId.value
    const card = cards.value.get(cardId)
    if (!card)
      return false

    const extension = resolveAiriExtension(card)
    cards.value.set(cardId, {
      ...card,
      extensions: {
        ...card.extensions,
        airi: {
          ...extension,
          modules: {
            ...extension.modules,
            ...patch(extension),
          },
        },
      },
    })

    return true
  }

  async function updateActiveCardDisplayModel(displayModelId: string | undefined) {
    const updated = updateActiveCardModules(() => ({ displayModelId }))
    if (updated)
      applyActiveCardSettings()
    return updated
  }

  async function updateActiveCardConsciousness(consciousness: AiriExtension['modules']['consciousness']) {
    const updated = updateActiveCardModules(() => ({ consciousness }))
    if (updated)
      applyActiveCardSettings()
    return updated
  }

  async function updateActiveCardVision(vision: AiriExtension['modules']['vision']) {
    const updated = updateActiveCardModules(() => ({ vision }))
    if (updated)
      applyActiveCardSettings()
    return updated
  }

  async function updateActiveCardSpeech(speech: Pick<AiriExtension['modules']['speech'], 'model' | 'provider' | 'voice_id'>) {
    const updated = updateActiveCardModules(({ modules }) => ({
      speech: {
        ...modules.speech,
        ...speech,
      },
    }))
    if (updated)
      applyActiveCardSettings()
    return updated
  }

  /**
   * Persists the current inference selections in the active card.
   *
   * This command snapshots runtime state after a higher-level operation, such
   * as authenticated default setup. It deliberately does not apply the card
   * back to the runtime, so one persistence write cannot start another module
   * transition.
   */
  async function persistActiveCardModuleSelections() {
    const card = cards.value.get(activeCardId.value)
    if (!card)
      return false

    const {
      consciousness,
      speech,
      vision,
    } = useRuntimeModuleStores()
    const modules = card.extensions?.airi?.modules
    const alreadyPersisted = modules?.consciousness?.provider === consciousness.activeProvider
      && modules.consciousness.model === consciousness.activeModel
      && modules?.speech?.provider === speech.activeSpeechProvider
      && modules.speech.model === speech.activeSpeechModel
      && modules.speech.voice_id === speech.activeSpeechVoiceId
      && modules?.vision?.provider === vision.activeProvider
      && modules.vision.model === vision.activeModel

    if (alreadyPersisted)
      return false

    return updateActiveCardModules(({ modules }) => ({
      consciousness: {
        model: consciousness.activeModel,
        provider: consciousness.activeProvider,
      },
      speech: {
        ...modules.speech,
        model: speech.activeSpeechModel,
        provider: speech.activeSpeechProvider,
        voice_id: speech.activeSpeechVoiceId,
      },
      vision: {
        model: vision.activeModel,
        provider: vision.activeProvider,
      },
    }))
  }

  function resolveAiriExtension(card: Card | ccv3.CharacterCardV3): AiriExtension {
    const {
      artistry,
      consciousness,
      speech,
      stageModel,
      vision,
    } = useRuntimeModuleStores()

    // Get existing extension if available
    const existingExtension = ('data' in card
      ? card.data?.extensions?.airi
      : card.extensions?.airi) as AiriExtension

    // Create default modules config
    const defaultModules = {
      artistry: {
        autonomousEnabled: false,
        autonomousTarget: 'assistant' as const,
        autonomousThreshold: 70,
        enabled: false,
        model: artistry.globalModel,
        options: artistry.globalProviderOptions,
        promptPrefix: artistry.globalPromptPrefix,
        provider: artistry.globalProvider,
        spawnMode: 'bg_widget' as const,
        widgetInstruction: DEFAULT_ARTISTRY_WIDGET_SPAWNING_PROMPT,
      },
      consciousness: {
        model: consciousness.activeModel,
        provider: consciousness.activeProvider,
      },
      displayModelId: stageModel.stageModelSelected,
      speech: {
        model: speech.activeSpeechModel,
        provider: speech.activeSpeechProvider,
        voice_id: speech.activeSpeechVoiceId,
      },
      vision: {
        model: vision.activeModel,
        provider: vision.activeProvider,
      },
    } as const

    // Return default if no extension exists
    if (!existingExtension) {
      return {
        agents: {},
        modules: defaultModules,
      }
    }

    // Merge existing extension with defaults
    return {
      agents: existingExtension.agents ?? {},
      modules: {
        activeBackgroundId: existingExtension.modules?.activeBackgroundId,
        artistry: {
          autonomousEnabled: existingExtension.modules?.artistry?.autonomousEnabled ?? (existingExtension as any).artistry?.autonomousEnabled ?? defaultModules.artistry.autonomousEnabled,
          autonomousTarget: existingExtension.modules?.artistry?.autonomousTarget ?? (existingExtension as any).artistry?.autonomousTarget ?? defaultModules.artistry.autonomousTarget,
          autonomousThreshold: existingExtension.modules?.artistry?.autonomousThreshold ?? (existingExtension as any).artistry?.autonomousThreshold ?? defaultModules.artistry.autonomousThreshold,
          enabled: existingExtension.modules?.artistry?.enabled ?? (existingExtension as any).artistry?.enabled ?? defaultModules.artistry.enabled,
          model: existingExtension.modules?.artistry?.model ?? (existingExtension as any).artistry?.model ?? defaultModules.artistry.model,
          options: existingExtension.modules?.artistry?.options ?? (existingExtension as any).artistry?.options ?? defaultModules.artistry.options,
          promptPrefix: existingExtension.modules?.artistry?.promptPrefix ?? (existingExtension as any).artistry?.promptPrefix ?? (existingExtension as any).artistry?.prompt_prefix ?? defaultModules.artistry.promptPrefix,
          provider: existingExtension.modules?.artistry?.provider ?? (existingExtension as any).artistry?.provider ?? defaultModules.artistry.provider,
          spawnMode: existingExtension.modules?.artistry?.spawnMode ?? (existingExtension as any).artistry?.spawnMode ?? defaultModules.artistry.spawnMode,
          widgetInstruction: existingExtension.modules?.artistry?.widgetInstruction ?? (existingExtension as any).artistry?.widgetInstruction ?? defaultModules.artistry.widgetInstruction,
          workflowId: existingExtension.modules?.artistry?.workflowId ?? (existingExtension as any).artistry?.workflowId ?? (existingExtension as any).artistry?.remixId,
        },
        consciousness: {
          model: existingExtension.modules?.consciousness?.model ?? defaultModules.consciousness.model,
          provider: existingExtension.modules?.consciousness?.provider ?? defaultModules.consciousness.provider,
        },
        displayModelId: existingExtension.modules?.displayModelId ?? defaultModules.displayModelId,
        live2d: existingExtension.modules?.live2d,
        speech: {
          language: existingExtension.modules?.speech?.language,
          model: existingExtension.modules?.speech?.model ?? defaultModules.speech.model,
          pitch: existingExtension.modules?.speech?.pitch,
          provider: existingExtension.modules?.speech?.provider ?? defaultModules.speech.provider,
          rate: existingExtension.modules?.speech?.rate,
          ssml: existingExtension.modules?.speech?.ssml,
          voice_id: existingExtension.modules?.speech?.voice_id ?? defaultModules.speech.voice_id,
        },
        vision: {
          model: existingExtension.modules?.vision?.model ?? defaultModules.vision.model,
          provider: existingExtension.modules?.vision?.provider ?? defaultModules.vision.provider,
        },
        vrm: existingExtension.modules?.vrm,
      },
    }
  }

  function newAiriCard(card: Card | ccv3.CharacterCardV3): AiriCard {
    // Handle ccv3 format if needed
    if ('data' in card) {
      const ccv3Card = card as ccv3.CharacterCardV3
      return {
        creator: ccv3Card.data.creator ?? '',
        description: ccv3Card.data.description ?? '',
        extensions: {
          airi: resolveAiriExtension(ccv3Card),
          ...ccv3Card.data.extensions,
        },
        greetings: [
          ccv3Card.data.first_mes,
          ...(ccv3Card.data.alternate_greetings ?? []),
        ],
        greetingsGroupOnly: ccv3Card.data.group_only_greetings ?? [],
        messageExample: ccv3Card.data.mes_example
          ? ccv3Card.data.mes_example
              .split('<START>\n')
              .filter(Boolean)
              .map(example => example.split('\n')
                .map((line) => {
                  if (line.startsWith('{{char}}:') || line.startsWith('{{user}}:'))
                    return line as `{{char}}: ${string}` | `{{user}}: ${string}`
                  throw new Error(`Invalid message example format: ${line}`)
                }))
          : [],
        name: ccv3Card.data.name,
        notes: ccv3Card.data.creator_notes ?? '',
        notesMultilingual: ccv3Card.data.creator_notes_multilingual,
        personality: ccv3Card.data.personality ?? '',
        postHistoryInstructions: ccv3Card.data.post_history_instructions ?? '',
        scenario: ccv3Card.data.scenario ?? '',
        systemPrompt: ccv3Card.data.system_prompt ?? '',
        tags: ccv3Card.data.tags ?? [],
        version: ccv3Card.data.character_version ?? '1.0.0',
      }
    }

    return {
      ...card,
      extensions: {
        airi: resolveAiriExtension(card),
        ...card.extensions,
      },
    }
  }

  async function initialize() {
    // This synchronized action executes in the leader. Each window calls it,
    // but only the first call can apply persisted card settings to the runtime.
    if (initialized)
      return

    initialized = true
    if (!cards.value.has('default')) {
      cards.value.set('default', newAiriCard({
        description: SystemPromptV2(
          t('base.prompt.prefix'),
          t('base.prompt.suffix'),
        ).content,
        name: 'ReLU',
        version: '1.0.0',
      }))
    }

    // The active id and card map are persisted separately. Older versions
    // could delete the selected card without repairing its stored id.
    if (!cards.value.has(activeCardId.value))
      activeCardId.value = 'default'

    applyActiveCardSettings()
  }

  /**
   * Selects a card and applies its module settings in the synchronization
   * leader. Replicated state snapshots never invoke this command.
   */
  async function activateCard(id: string) {
    if (!cards.value.has(id))
      return false

    activeCardId.value = id
    applyActiveCardSettings()
    return true
  }

  function applyActiveCardSettings(newCard = activeCard.value) {
    const {
      artistry,
      consciousness,
      speech,
      stageModel,
      vision,
    } = useRuntimeModuleStores()

    artistry.resetToGlobal()

    if (!newCard)
      return

    // TODO: Minecraft Agent, etc
    const extension = resolveAiriExtension(newCard)
    if (!extension)
      return

    const consciousnessSettings = extension.modules?.consciousness
    if (consciousnessSettings?.provider)
      consciousness.activeProvider = consciousnessSettings.provider
    if (consciousnessSettings?.model)
      consciousness.activeModel = consciousnessSettings.model

    const visionSettings = extension.modules?.vision
    if (visionSettings?.provider)
      vision.activeProvider = visionSettings.provider
    if (visionSettings?.model)
      vision.activeModel = visionSettings.model

    const speechSettings = extension.modules?.speech
    if (speechSettings?.provider)
      speech.activeSpeechProvider = speechSettings.provider
    if (speechSettings?.model)
      speech.activeSpeechModel = speechSettings.model
    if (speechSettings?.voice_id)
      speech.activeSpeechVoiceId = speechSettings.voice_id

    // Apply body model if the card has a display model configured.
    // NOTICE: must set via store property directly (not storeToRefs .value) so Pinia's
    // proxy correctly calls the writable computed setter → stageModelSelectedState → updateStageModel().
    if (extension.modules?.displayModelId) {
      stageModel.stageModelSelected = extension.modules.displayModelId
    }

    if (extension.modules?.artistry) {
      if (extension.modules.artistry.provider)
        artistry.activeProvider = extension.modules.artistry.provider
      if (extension.modules.artistry.model)
        artistry.activeModel = extension.modules.artistry.model
      if (extension.modules.artistry.promptPrefix)
        artistry.defaultPromptPrefix = extension.modules.artistry.promptPrefix
      if (extension.modules.artistry.options)
        artistry.providerOptions = extension.modules.artistry.options
    }
  }

  function resetState() {
    initialized = false
    cards.reset()
    activeCardId.reset()
  }

  return {
    activateCard,
    activeCard,
    activeCardId,
    addCard,
    cards,
    currentModels: computed(() => {
      const {
        consciousness,
        speech,
        stageModel,
        vision,
      } = useRuntimeModuleStores()

      return {
        activeBackgroundId: activeCard.value?.extensions?.airi?.modules?.activeBackgroundId,
        consciousness: {
          model: consciousness.activeModel,
          provider: consciousness.activeProvider,
        },
        displayModelId: stageModel.stageModelSelected,
        speech: {
          model: speech.activeSpeechModel,
          provider: speech.activeSpeechProvider,
          voice_id: speech.activeSpeechVoiceId,
        },
        vision: {
          model: vision.activeModel,
          provider: vision.activeProvider,
        },
      } satisfies AiriExtension['modules']
    }),
    getCard,
    initialize,
    persistActiveCardModuleSelections,
    removeCard,
    resetState,
    systemPrompt: computed(() => resolveSystemPrompt(activeCard.value)),
    updateActiveCardConsciousness,
    updateActiveCardDisplayModel,
    updateActiveCardSpeech,

    updateActiveCardVision,
    updateCard,
  }
}, {
  synced: {
    actions: [
      'activateCard',
      'addCard',
      'initialize',
      'removeCard',
      'persistActiveCardModuleSelections',
      'updateActiveCardConsciousness',
      'updateActiveCardDisplayModel',
      'updateActiveCardSpeech',
      'updateActiveCardVision',
      'updateCard',
    ],
    state: true,
  },
})
