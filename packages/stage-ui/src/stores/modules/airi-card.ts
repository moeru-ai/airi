import type { Card, ccv3 } from '@proj-airi/ccc'

import type { CardModuleDefaults } from '../../services/airi-card-modules'
import type { AiriCard, AiriExtension } from '../../types/airiCard'

import { errorMessageFrom } from '@moeru/std'
import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { StorageSerializers } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { computed, toRaw } from 'vue'
import { useI18n } from 'vue-i18n'

import { DEFAULT_ARTISTRY_WIDGET_SPAWNING_PROMPT } from '../../constants/prompts/character-defaults'
import { captureAnalyticsEvent } from '../../libs/product-signals'
import { resolveModuleSelection } from '../../services/airi-card-modules'
import { useProviderConfigStore } from '../providers/config'
import { useSettingsStageModel } from '../settings/stage-model'
import { useArtistryStore } from './artistry'
import { useConsciousnessStore } from './consciousness'
import { configureAsDefaultsIfEmpty, unconfigureAuthenticationProviders } from './default'
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

  // Only leader-owned commands change defaults or apply card overrides. Runtime
  // module stores contain the effective selections, not another source of defaults.
  // Existing installations seed this snapshot once from their current settings.
  const moduleDefaults = useLocalStorageManualReset<CardModuleDefaults | null>('airi-card-module-defaults', null, {
    listenToStorageChanges: false,
    serializer: StorageSerializers.object,
  })
  let appliedModules: AiriExtension['modules'] | undefined
  let pendingAuthenticationSetup: Promise<void> | undefined

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

  function readRuntimeModules(): CardModuleDefaults {
    const { consciousness, vision, speech, stageModel } = useRuntimeModuleStores()
    return {
      consciousness: { provider: consciousness.activeProvider, model: consciousness.activeModel },
      vision: { provider: vision.activeProvider, model: vision.activeModel },
      speech: { provider: speech.activeSpeechProvider, model: speech.activeSpeechModel, voice_id: speech.activeSpeechVoiceId },
      displayModelId: stageModel.stageModelSelected,
    }
  }

  function rememberInheritedSettings() {
    const runtime = readRuntimeModules()
    const defaults = moduleDefaults.value
    if (!defaults) {
      moduleDefaults.value = runtime
      return
    }
    if (!appliedModules)
      return

    // A user can change an inherited setting through a module surface. Retain
    // those changes, but never promote the previous card's overrides to defaults.
    const next = structuredClone(toRaw(defaults))
    for (const module of ['consciousness', 'vision', 'speech'] as const) {
      const previous = appliedModules[module]
      if (previous.provider)
        continue
      if (next[module].provider !== runtime[module].provider)
        next[module].model = ''
      next[module].provider = runtime[module].provider
      if (!previous.model)
        next[module].model = runtime[module].model
    }
    if (!appliedModules.speech.provider && !appliedModules.speech.model && !appliedModules.speech.voice_id)
      next.speech.voice_id = runtime.speech.voice_id
    if (!appliedModules.displayModelId)
      next.displayModelId = runtime.displayModelId
    moduleDefaults.value = next
  }

  function writeRuntimeModules(modules: CardModuleDefaults) {
    const { consciousness, vision, speech, stageModel } = useRuntimeModuleStores()
    // Provider changes synchronously clear dependent selections. Assign the
    // resolved model and voice afterwards, including empty values.
    consciousness.activeProvider = modules.consciousness.provider
    consciousness.activeModel = modules.consciousness.model
    vision.activeProvider = modules.vision.provider
    vision.activeModel = modules.vision.model
    speech.activeSpeechProvider = modules.speech.provider
    speech.activeSpeechModel = modules.speech.model
    speech.activeSpeechVoiceId = modules.speech.voice_id
    if (modules.displayModelId !== undefined)
      stageModel.stageModelSelected = modules.displayModelId
  }

  /**
   * Updates authenticated defaults without changing any card's stored overrides.
   * The synchronization leader owns provider setup, persistence, and reapplication.
   */
  async function configureForAuthentication(authenticated: boolean) {
    const previous = pendingAuthenticationSetup
    const operation = (async () => {
      // A failed setup is reported to its caller. The next auth event must
      // still run, for example to remove providers after a failed login.
      if (previous)
        await previous.catch(() => {})
      await applyAuthenticationDefaults(authenticated)
      if (authenticated) {
        // Voice discovery is owned by the speech action. It must not hold the
        // authentication queue, card edits, or logout cleanup open on network IO.
        void loadAuthenticatedSpeechVoices().catch((error) => {
          console.error('Failed to refresh authenticated speech voices:', errorMessageFrom(error))
        })
      }
    })()
    pendingAuthenticationSetup = operation
    try {
      await operation
    }
    finally {
      if (pendingAuthenticationSetup === operation)
        pendingAuthenticationSetup = undefined
    }
  }

  async function applyAuthenticationDefaults(authenticated: boolean) {
    rememberInheritedSettings()
    if (!moduleDefaults.value)
      return
    writeRuntimeModules(moduleDefaults.value)
    try {
      if (authenticated)
        await configureAsDefaultsIfEmpty()
      else
        await unconfigureAuthenticationProviders()
      moduleDefaults.value = readRuntimeModules()
    }
    finally {
      appliedModules = undefined
      applyActiveCardSettings()
    }
  }

  /** Loads the effective auth-owned voice catalog after card setup finishes. */
  async function loadAuthenticatedSpeechVoices(): Promise<void> {
    const { speech } = useRuntimeModuleStores()
    const provider = useProviderConfigStore().providers[speech.activeSpeechProvider]
    if (provider?.configuredBy !== 'authentication')
      return

    speech.ensureActiveSpeechModel()
    await speech.loadVoicesForProvider(
      speech.activeSpeechProvider,
      speech.activeSpeechModel || undefined,
    )
  }

  /**
   * `source` feeds the `card_created` analytics event: `scratch` = built in
   * the creation dialog, `import` = ccv3 JSON upload, `duplicate` = cloned
   * from an existing card (profile switcher). Required so a new call site
   * can't silently degrade creation attribution.
   */
  const addCard = async (card: AiriCard | Card | ccv3.CharacterCardV3, source: 'scratch' | 'import' | 'duplicate') => {
    const newCardId = nanoid()
    cards.value.set(newCardId, newAiriCard(card))
    captureAnalyticsEvent('card_created', { card_id: newCardId, source })
    return newCardId
  }

  const removeCard = async (id: string) => {
    await pendingAuthenticationSetup
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
    await pendingAuthenticationSetup
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
    await pendingAuthenticationSetup
    const updated = updateActiveCardModules(() => ({ displayModelId }))
    if (updated)
      applyActiveCardSettings()
    return updated
  }

  async function updateActiveCardConsciousness(consciousness: AiriExtension['modules']['consciousness']) {
    await pendingAuthenticationSetup
    const updated = updateActiveCardModules(() => ({ consciousness }))
    if (updated)
      applyActiveCardSettings()
    return updated
  }

  async function updateActiveCardVision(vision: AiriExtension['modules']['vision']) {
    await pendingAuthenticationSetup
    const updated = updateActiveCardModules(() => ({ vision }))
    if (updated)
      applyActiveCardSettings()
    return updated
  }

  async function updateActiveCardSpeech(speech: Pick<AiriExtension['modules']['speech'], 'provider' | 'model' | 'voice_id'>) {
    await pendingAuthenticationSetup
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

  /** Clears a removed provider from defaults and the active card, not other cards. */
  async function clearProviderSelections(providerId: string) {
    await pendingAuthenticationSetup
    rememberInheritedSettings()
    const defaults = moduleDefaults.value
    if (!defaults)
      return
    const next = structuredClone(toRaw(defaults))
    for (const module of ['consciousness', 'vision', 'speech'] as const) {
      if (next[module].provider === providerId) {
        next[module].provider = module === 'speech' ? 'speech-noop' : ''
        next[module].model = ''
        if (module === 'speech')
          next.speech.voice_id = ''
      }
    }
    moduleDefaults.value = next
    updateActiveCardModules(({ modules }) => ({
      consciousness: modules.consciousness.provider === providerId ? { provider: '', model: '' } : modules.consciousness,
      vision: modules.vision.provider === providerId ? { provider: '', model: '' } : modules.vision,
      speech: modules.speech.provider === providerId ? { ...modules.speech, provider: '', model: '', voice_id: '' } : modules.speech,
    }))
    appliedModules = undefined
    applyActiveCardSettings()
  }

  function resolveAiriExtension(card: Card | ccv3.CharacterCardV3): AiriExtension {
    // Get existing extension if available
    const existingExtension = ('data' in card
      ? card.data?.extensions?.airi
      : card.extensions?.airi) as AiriExtension

    // Create default modules config
    const defaultModules = {
      consciousness: { provider: '', model: '' },
      vision: { provider: '', model: '' },
      speech: { provider: '', model: '', voice_id: '' },
      displayModelId: '',
      artistry: {
        enabled: false,
        provider: '',
        model: '',
        promptPrefix: '',
        widgetInstruction: DEFAULT_ARTISTRY_WIDGET_SPAWNING_PROMPT,
        spawnMode: 'bg_widget' as const,
        options: undefined,
        autonomousEnabled: false,
        autonomousThreshold: 70,
        autonomousTarget: 'assistant' as const,
      },
    } as const

    // Return default if no extension exists
    if (!existingExtension) {
      return {
        modules: defaultModules,
        agents: {},
      }
    }

    // Fill known fields without discarding settings owned by imported extensions.
    return {
      ...existingExtension,
      modules: {
        ...existingExtension.modules,
        consciousness: {
          ...existingExtension.modules?.consciousness,
          provider: existingExtension.modules?.consciousness?.provider ?? defaultModules.consciousness.provider,
          model: existingExtension.modules?.consciousness?.model ?? defaultModules.consciousness.model,
        },
        vision: {
          ...existingExtension.modules?.vision,
          provider: existingExtension.modules?.vision?.provider ?? defaultModules.vision.provider,
          model: existingExtension.modules?.vision?.model ?? defaultModules.vision.model,
        },
        speech: {
          ...existingExtension.modules?.speech,
          provider: existingExtension.modules?.speech?.provider ?? defaultModules.speech.provider,
          model: existingExtension.modules?.speech?.model ?? defaultModules.speech.model,
          voice_id: existingExtension.modules?.speech?.voice_id ?? defaultModules.speech.voice_id,
          pitch: existingExtension.modules?.speech?.pitch,
          rate: existingExtension.modules?.speech?.rate,
          ssml: existingExtension.modules?.speech?.ssml,
          language: existingExtension.modules?.speech?.language,
        },
        vrm: existingExtension.modules?.vrm,
        live2d: existingExtension.modules?.live2d,
        displayModelId: existingExtension.modules?.displayModelId ?? defaultModules.displayModelId,
        activeBackgroundId: existingExtension.modules?.activeBackgroundId,
        artistry: {
          ...existingExtension.modules?.artistry,
          enabled: existingExtension.modules?.artistry?.enabled ?? (existingExtension as any).artistry?.enabled ?? defaultModules.artistry.enabled,
          provider: existingExtension.modules?.artistry?.provider ?? (existingExtension as any).artistry?.provider ?? defaultModules.artistry.provider,
          model: existingExtension.modules?.artistry?.model ?? (existingExtension as any).artistry?.model ?? defaultModules.artistry.model,
          promptPrefix: existingExtension.modules?.artistry?.promptPrefix ?? (existingExtension as any).artistry?.promptPrefix ?? (existingExtension as any).artistry?.prompt_prefix ?? defaultModules.artistry.promptPrefix,
          workflowId: existingExtension.modules?.artistry?.workflowId ?? (existingExtension as any).artistry?.workflowId ?? (existingExtension as any).artistry?.remixId,
          widgetInstruction: existingExtension.modules?.artistry?.widgetInstruction ?? (existingExtension as any).artistry?.widgetInstruction ?? defaultModules.artistry.widgetInstruction,
          spawnMode: existingExtension.modules?.artistry?.spawnMode ?? (existingExtension as any).artistry?.spawnMode ?? defaultModules.artistry.spawnMode,
          options: existingExtension.modules?.artistry?.options ?? (existingExtension as any).artistry?.options ?? defaultModules.artistry.options,
          autonomousEnabled: existingExtension.modules?.artistry?.autonomousEnabled ?? (existingExtension as any).artistry?.autonomousEnabled ?? defaultModules.artistry.autonomousEnabled,
          autonomousThreshold: existingExtension.modules?.artistry?.autonomousThreshold ?? (existingExtension as any).artistry?.autonomousThreshold ?? defaultModules.artistry.autonomousThreshold,
          autonomousTarget: existingExtension.modules?.artistry?.autonomousTarget ?? (existingExtension as any).artistry?.autonomousTarget ?? defaultModules.artistry.autonomousTarget,
        },
      },
      agents: existingExtension.agents ?? {},
    }
  }

  function newAiriCard(card: Card | ccv3.CharacterCardV3): AiriCard {
    // Handle ccv3 format if needed
    if ('data' in card) {
      const ccv3Card = card as ccv3.CharacterCardV3
      return {
        name: ccv3Card.data.name,
        version: ccv3Card.data.character_version ?? '1.0.0',
        description: ccv3Card.data.description ?? '',
        creator: ccv3Card.data.creator ?? '',
        notes: ccv3Card.data.creator_notes ?? '',
        notesMultilingual: ccv3Card.data.creator_notes_multilingual,
        personality: ccv3Card.data.personality ?? '',
        scenario: ccv3Card.data.scenario ?? '',
        greetings: [
          ccv3Card.data.first_mes,
          ...(ccv3Card.data.alternate_greetings ?? []),
        ],
        greetingsGroupOnly: ccv3Card.data.group_only_greetings ?? [],
        systemPrompt: ccv3Card.data.system_prompt ?? '',
        postHistoryInstructions: ccv3Card.data.post_history_instructions ?? '',
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
        tags: ccv3Card.data.tags ?? [],
        extensions: {
          ...ccv3Card.data.extensions,
          airi: resolveAiriExtension(ccv3Card),
        },
      }
    }

    return {
      ...card,
      extensions: {
        ...card.extensions,
        airi: resolveAiriExtension(card),
      },
    }
  }

  /** Applies the initial card while preserving setup context when no auth work is pending. */
  async function initialize() {
    // Awaiting undefined would leave component setup before the first runtime
    // stores bind i18n. An existing auth operation already owns those stores.
    if (pendingAuthenticationSetup)
      await pendingAuthenticationSetup
    // This synchronized action executes in the leader. Each window calls it,
    // but only the first call can apply persisted card settings to the runtime.
    if (initialized)
      return

    initialized = true
    if (!cards.value.has('default')) {
      const defaultCard: AiriCard = {
        name: 'ReLU',
        version: '1.0.0',
        description: t('base.prompt.prefix'),
        extensions: {
          airi: {
            modules: {
              consciousness: { provider: '', model: '' },
              speech: { provider: '', model: '', voice_id: '' },
              vision: { provider: '', model: '' },
            },
            agents: {},
          },
        },
      }
      cards.value.set('default', newAiriCard(defaultCard))
    }

    // Stored speech-noop can mean an intentional mute. Only the editor may
    // replace it with inheritance; the old placeholder has no provenance marker.
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
    await pendingAuthenticationSetup
    if (!cards.value.has(id))
      return false

    activeCardId.value = id
    applyActiveCardSettings()
    return true
  }

  function applyActiveCardSettings(newCard = activeCard.value) {
    rememberInheritedSettings()
    const artistry = useArtistryStore()

    artistry.resetToGlobal()

    if (!newCard)
      return

    // TODO: Minecraft Agent, etc
    const extension = resolveAiriExtension(newCard)
    if (!extension)
      return

    const defaults = moduleDefaults.value
    if (!defaults)
      return
    const modules = extension.modules
    const speechSelection = resolveModuleSelection(modules.speech, defaults.speech)
    const resolved: CardModuleDefaults = {
      consciousness: resolveModuleSelection(modules.consciousness, defaults.consciousness),
      vision: resolveModuleSelection(modules.vision, defaults.vision),
      speech: {
        ...speechSelection,
        voice_id: modules.speech.voice_id || (
          speechSelection.provider === defaults.speech.provider && speechSelection.model === defaults.speech.model
            ? defaults.speech.voice_id
            : ''
        ),
      },
      displayModelId: modules.displayModelId || defaults.displayModelId,
    }
    const providers = useProviderConfigStore().providers
    for (const module of ['consciousness', 'vision', 'speech'] as const) {
      const provider = providers[resolved[module].provider]
      // Logout disables authenticated providers without deleting card choices.
      if (provider?.configuredBy === 'authentication' && provider.status === 'unconfigured') {
        resolved[module].provider = module === 'speech' ? 'speech-noop' : ''
        resolved[module].model = ''
        if (module === 'speech')
          resolved.speech.voice_id = ''
      }
    }
    writeRuntimeModules(resolved)
    appliedModules = modules

    if (extension.modules?.artistry) {
      const selection = resolveModuleSelection({
        provider: extension.modules.artistry.provider ?? '',
        model: extension.modules.artistry.model ?? '',
      }, { provider: artistry.globalProvider, model: artistry.globalModel })
      artistry.activeProvider = selection.provider
      artistry.activeModel = selection.model
      if (selection.provider !== artistry.globalProvider)
        artistry.providerOptions = undefined
      if (extension.modules.artistry.promptPrefix)
        artistry.defaultPromptPrefix = extension.modules.artistry.promptPrefix
      if (extension.modules.artistry.options)
        artistry.providerOptions = extension.modules.artistry.options
    }
  }

  function resetState() {
    initialized = false
    appliedModules = undefined
    moduleDefaults.reset()
    cards.reset()
    activeCardId.reset()
  }

  return {
    cards,
    moduleDefaults,
    activeCard,
    activeCardId,
    addCard,
    removeCard,
    updateCard,
    updateActiveCardConsciousness,
    updateActiveCardDisplayModel,
    updateActiveCardSpeech,
    updateActiveCardVision,
    getCard,
    resetState,
    initialize,
    activateCard,
    configureForAuthentication,
    clearProviderSelections,

    currentModels: computed(() => {
      const {
        consciousness,
        speech,
        stageModel,
        vision,
      } = useRuntimeModuleStores()

      return {
        consciousness: {
          provider: consciousness.activeProvider,
          model: consciousness.activeModel,
        },
        vision: {
          provider: vision.activeProvider,
          model: vision.activeModel,
        },
        speech: {
          provider: speech.activeSpeechProvider,
          model: speech.activeSpeechModel,
          voice_id: speech.activeSpeechVoiceId,
        },
        displayModelId: stageModel.stageModelSelected,
        activeBackgroundId: activeCard.value?.extensions?.airi?.modules?.activeBackgroundId,
      } satisfies AiriExtension['modules']
    }),
    systemPrompt: computed(() => resolveSystemPrompt(activeCard.value)),
  }
}, {
  synced: {
    actions: [
      'activateCard',
      'addCard',
      'initialize',
      'configureForAuthentication',
      'clearProviderSelections',
      'removeCard',
      'updateActiveCardConsciousness',
      'updateActiveCardDisplayModel',
      'updateActiveCardSpeech',
      'updateActiveCardVision',
      'updateCard',
    ],
    state: true,
  },
})
