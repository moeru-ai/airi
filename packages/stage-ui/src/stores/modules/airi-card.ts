import type { Card, ccv3 } from '@proj-airi/ccc'

import type { CardModuleDefaults } from '../../services/airi-card-modules'
import type { AiriCard, AiriExtension } from '../../types/airiCard'

import { errorMessageFrom } from '@moeru/std'
import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore, getActivePinia, storeToRefs } from 'pinia'
import { computed, toRaw, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { DEFAULT_ARTISTRY_WIDGET_SPAWNING_PROMPT } from '../../constants/prompts/character-defaults'
import { captureAnalyticsEvent } from '../../libs/product-signals'
import { resolveCardModules, resolveModuleSelection } from '../../services/airi-card-modules'
import { useProviderConfigStore } from '../providers/config'
import { useSettingsStageModel } from '../settings/stage-model'
import { useAiriCardCatalog } from './airi-card-catalog'
import { useArtistryStore } from './artistry'
import { useArtistrySettingsStore } from './artistry-settings'
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
  const pinia = getActivePinia()
  const { t } = useI18n()

  const catalog = useAiriCardCatalog()
  const { cards, moduleDefaults } = storeToRefs(catalog)
  const activeCardId = useLocalStorageManualReset<string>('airi-card-active-id', 'default', { listenToStorageChanges: false })
  let initialized = false
  let initialization: Promise<void> | undefined
  let selectionGeneration = 0
  let appliedModules: AiriExtension['modules'] | undefined
  let pendingAuthenticationSetup: Promise<void> | undefined

  const activeCard = computed(() => cards.value.get(activeCardId.value))
  function useRuntimeModuleStores() {
    return {
      artistry: useArtistryStore(pinia),
      consciousness: useConsciousnessStore(pinia),
      speech: useSpeechStore(pinia),
      stageModel: useSettingsStageModel(pinia),
      vision: useVisionStore(pinia),
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

  async function rememberInheritedSettings() {
    const runtime = readRuntimeModules()
    const defaults = moduleDefaults.value
    if (!defaults) {
      await catalog.updateDefaults(runtime)
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
    await catalog.updateDefaults(next)
  }

  /** Applies all resolved selections in this window before its asynchronous catalog discovery. */
  async function writeRuntimeModules(modules: CardModuleDefaults) {
    const { consciousness, vision, speech, stageModel } = useRuntimeModuleStores()
    // Provider changes synchronously clear dependent selections. Assign the
    // resolved model and voice afterwards, including empty values.
    consciousness.activeProvider = modules.consciousness.provider
    consciousness.activeModel = modules.consciousness.model
    vision.activeProvider = modules.vision.provider
    vision.activeModel = modules.vision.model
    if (modules.displayModelId !== undefined)
      stageModel.stageModelSelected = modules.displayModelId
    await speech.selectProviderModel(modules.speech.provider, modules.speech.model, modules.speech.voice_id)
  }

  /**
   * Updates authenticated defaults without changing any card's stored overrides.
   * Shared provider commands own setup; this window owns runtime reapplication.
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
    await rememberInheritedSettings()
    if (!moduleDefaults.value)
      return
    await writeRuntimeModules(moduleDefaults.value)
    try {
      if (authenticated)
        await configureAsDefaultsIfEmpty()
      else
        await unconfigureAuthenticationProviders()
      await catalog.updateDefaults(readRuntimeModules())
    }
    finally {
      appliedModules = undefined
      await applyActiveCardSettings()
    }
  }

  /** Loads the effective auth-owned voice catalog after card setup finishes. */
  async function loadAuthenticatedSpeechVoices(): Promise<void> {
    const { speech } = useRuntimeModuleStores()
    const provider = useProviderConfigStore(pinia).providers[speech.activeSpeechProvider]
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
    const newCardId = await catalog.addCard(newAiriCard(card))
    captureAnalyticsEvent('card_created', { card_id: newCardId, source })
    return newCardId
  }

  const removeCard = async (id: string) => {
    await pendingAuthenticationSetup
    // The built-in card is the guaranteed fallback for every runtime profile.
    if (id === 'default')
      return false

    const removed = await catalog.removeCard(id)
    if (!removed)
      return false

    // The active id is persisted independently from the card map. Reset it
    // before consumers observe a dangling runtime profile after deletion.
    if (activeCardId.value === id) {
      activeCardId.value = 'default'
      await applyActiveCardSettings()
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
    await catalog.updateCard(id, card)
    if (id === activeCardId.value)
      await applyActiveCardSettings(card)

    return true
  }

  const getCard = (id: string) => {
    return cards.value.get(id)
  }

  /** Resolves a conversation's character independently of this window's current selection. */
  function resolveCharacter(id: string) {
    const card = cards.value.get(id)
    if (!card)
      throw new Error(`Character "${id}" does not exist`)
    return {
      id,
      card,
      systemPrompt: resolveSystemPrompt(card),
      modules: resolveAvailableModules(resolveAiriExtension(card).modules),
    }
  }

  function resolveAvailableModules(modules: AiriExtension['modules']) {
    const defaults = moduleDefaults.value
    if (!defaults)
      throw new Error('Character defaults have not been initialized')
    const resolved = resolveCardModules(modules, defaults)
    const providers = useProviderConfigStore(pinia).providers
    for (const module of ['consciousness', 'vision', 'speech'] as const) {
      const provider = providers[resolved[module].provider]
      if (provider?.configuredBy === 'authentication' && provider.status === 'unconfigured') {
        resolved[module].provider = module === 'speech' ? 'speech-noop' : ''
        resolved[module].model = ''
        if (module === 'speech')
          resolved.speech.voice_id = ''
      }
    }
    const globals = useArtistrySettingsStore(pinia)
    const artistry = resolveModuleSelection({ provider: modules.artistry?.provider ?? '', model: modules.artistry?.model ?? '' }, { provider: globals.globalProvider, model: globals.globalModel })
    return {
      ...resolved,
      artistry: {
        ...modules.artistry,
        ...artistry,
        promptPrefix: modules.artistry?.promptPrefix || globals.globalPromptPrefix,
        options: modules.artistry?.options ?? (artistry.provider === globals.globalProvider ? globals.globalProviderOptions : undefined),
      },
    }
  }

  async function updateActiveCardModules(patch: (extension: AiriExtension) => Partial<AiriExtension['modules']>) {
    const cardId = activeCardId.value
    const card = cards.value.get(cardId)
    if (!card)
      return false
    await rememberInheritedSettings()
    return catalog.updateModules(cardId, patch(resolveAiriExtension(card)))
  }

  /** Saves a card's model binding without selecting that card. Empty bindings inherit the global model. */
  async function updateCardDisplayModel(cardId: string, displayModelId: string | undefined) {
    await pendingAuthenticationSetup
    const updated = await catalog.updateModules(cardId, { displayModelId })
    if (updated && activeCardId.value === cardId)
      await applyActiveCardSettings()
    return updated
  }

  async function updateActiveCardDisplayModel(displayModelId: string | undefined) {
    await pendingAuthenticationSetup
    await rememberInheritedSettings()
    return updateCardDisplayModel(activeCardId.value, displayModelId)
  }

  async function updateActiveCardConsciousness(consciousness: AiriExtension['modules']['consciousness']) {
    await pendingAuthenticationSetup
    const updated = await updateActiveCardModules(() => ({ consciousness }))
    if (updated)
      await applyActiveCardSettings()
    return updated
  }

  async function updateActiveCardVision(vision: AiriExtension['modules']['vision']) {
    await pendingAuthenticationSetup
    const updated = await updateActiveCardModules(() => ({ vision }))
    if (updated)
      await applyActiveCardSettings()
    return updated
  }

  async function updateActiveCardSpeech(speech: Pick<AiriExtension['modules']['speech'], 'provider' | 'model' | 'voice_id'>) {
    await pendingAuthenticationSetup
    const updated = await updateActiveCardModules(({ modules }) => ({
      speech: {
        ...modules.speech,
        ...speech,
      },
    }))
    if (updated)
      await applyActiveCardSettings()
    return updated
  }

  /** Clears a removed provider from defaults and the active card, not other cards. */
  async function clearProviderSelections(providerId: string) {
    await pendingAuthenticationSetup
    await rememberInheritedSettings()
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
    await catalog.updateDefaults(next)
    await updateActiveCardModules(({ modules }) => ({
      consciousness: modules.consciousness.provider === providerId ? { provider: '', model: '' } : modules.consciousness,
      vision: modules.vision.provider === providerId ? { provider: '', model: '' } : modules.vision,
      speech: modules.speech.provider === providerId ? { ...modules.speech, provider: '', model: '', voice_id: '' } : modules.speech,
    }))
    appliedModules = undefined
    await applyActiveCardSettings()
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
  async function initializeRuntime() {
    // Awaiting undefined would leave component setup before the first runtime
    // stores bind i18n. An existing auth operation already owns those stores.
    if (pendingAuthenticationSetup)
      await pendingAuthenticationSetup
    if (initialized)
      return

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
      await catalog.initialize(newAiriCard(defaultCard), readRuntimeModules())
    }

    // Stored speech-noop can mean an intentional mute. Only the editor may
    // replace it with inheritance; the old placeholder has no provenance marker.
    // The active id and card map are persisted separately. Older versions
    // could delete the selected card without repairing its stored id.
    if (!cards.value.has(activeCardId.value))
      activeCardId.value = 'default'

    await applyActiveCardSettings()
    initialized = true
  }

  /** Shares startup work within this window; callers wait until its runtime selection is ready. */
  async function initialize() {
    if (initialization)
      return initialization
    const operation = initializeRuntime()
    initialization = operation
    try {
      await operation
    }
    finally {
      if (initialization === operation)
        initialization = undefined
    }
  }

  /**
   * Selects a character only in this window. Shared card edits do not navigate other windows.
   */
  async function activateCard(id: string) {
    const generation = ++selectionGeneration
    await pendingAuthenticationSetup
    if (!cards.value.has(id))
      return false

    await rememberInheritedSettings()
    if (generation !== selectionGeneration)
      return false
    activeCardId.value = id
    await applyActiveCardSettings()
    return true
  }

  async function applyActiveCardSettings(newCard = activeCard.value) {
    if (!moduleDefaults.value)
      return
    const artistry = useArtistryStore(pinia)

    artistry.resetToGlobal()

    if (!newCard)
      return

    // TODO: Minecraft Agent, etc
    const extension = resolveAiriExtension(newCard)
    if (!extension)
      return

    const modules = extension.modules
    const resolved = resolveAvailableModules(modules)
    appliedModules = modules
    artistry.activeProvider = resolved.artistry.provider
    artistry.activeModel = resolved.artistry.model
    artistry.defaultPromptPrefix = resolved.artistry.promptPrefix
    artistry.providerOptions = resolved.artistry.options
    await writeRuntimeModules(resolved)
  }

  async function resetState() {
    initialized = false
    appliedModules = undefined
    await catalog.resetState()
    activeCardId.value = 'default'
  }

  const artistrySettings = useArtistrySettingsStore(pinia)
  watch([activeCard, moduleDefaults, () => artistrySettings.globalProvider, () => artistrySettings.globalModel, () => artistrySettings.globalPromptPrefix, () => artistrySettings.globalProviderOptions], async () => {
    if (!initialized)
      return
    if (!activeCard.value)
      activeCardId.value = 'default'
    await applyActiveCardSettings()
  })

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
    updateCardDisplayModel,
    updateActiveCardSpeech,
    updateActiveCardVision,
    getCard,
    resolveCharacter,
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
})
