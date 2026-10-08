import type { Card, ccv3 } from '@proj-airi/ccc'

import type { DocumentFields, DocumentSnapshot, DocumentSyncClient, LocalDocumentChanges } from '../../libs/document-sync'
import type { CardModuleDefaults } from '../../services/airi-card-modules'
import type { AiriCard, AiriExtension } from '../../types/airiCard'

import localeMessages from '@proj-airi/i18n/locales'

import { errorMessageFrom } from '@moeru/std'
import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { StorageSerializers, useDocumentVisibility, watchDebounced } from '@vueuse/core'
import { isEqual } from 'es-toolkit'
import { nanoid } from 'nanoid'
import { defineStore, storeToRefs } from 'pinia'
import { array, looseObject, object, parse, safeParse, string } from 'valibot'
import { computed, ref, toRaw, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import { DEFAULT_ARTISTRY_WIDGET_SPAWNING_PROMPT } from '../../constants/prompts/character-defaults'
import { documentSyncRepo } from '../../database/repos/document-sync.repo'
import { authedFetch } from '../../libs/auth-fetch'
import { joinCard, splitCard } from '../../libs/character-card-sync'
import { createDocumentSyncClient, syncedValues, synchronize } from '../../libs/document-sync'
import { CHARACTER_CARD_SYNC_FLAG } from '../../libs/feature-flags'
import { captureAnalyticsEvent } from '../../libs/product-signals'
import { SERVER_URL } from '../../libs/server'
import { wakeWordSchema } from '../../libs/voice/wake-words'
import { resolveModuleSelection } from '../../services/airi-card-modules'
import { useAuthStore } from '../auth'
import { useFeatureFlagsStore } from '../feature-flags'
import { useProviderConfigStore } from '../providers/config'
import { useProviderStore } from '../providers/provider'
import { useSettingsStageModel } from '../settings/stage-model'
import { useArtistryStore } from './artistry'
import { useConsciousnessStore } from './consciousness'
import { configureAsDefaultsIfEmpty, unconfigureAuthenticationProviders } from './default'
import { useSpeechStore } from './speech'
import { useVisionStore } from './vision'

export type { AiriCard, AiriExtension } from '../../types/airiCard'

/**
 * Where a card stands with the account. `refused` means that the server does
 * not accept the card, for example because the account is over its storage limit.
 */
export type CardSyncState = 'synced' | 'pending' | 'refused'

/** The route of the server that stores the cards. */
const CARDS_PATH = '/api/v1/character-cards'

/** Names the sync state of the cards in the local storage. */
const SYNC_STATE_NAME = 'character-cards'

/**
 * The text of the built-in description in every language. A device creates the
 * built-in card once, in its language at that time. The language can change
 * later, so a stored description can come from another language than the
 * current one. None of these texts is an edit by the user.
 */
const builtInDescriptions = Object.values(localeMessages).flatMap((messages) => {
  // A translation can lack the text until Crowdin delivers it. The language then shows the English text.
  const parsed = safeParse(object({ base: object({ prompt: object({ prefix: string() }) }) }), messages)
  return parsed.success ? [parsed.output.base.prompt.prefix] : []
})

/** The members that every card needs before `newAiriCard` can normalize it. */
const synchronizedCardSchema = looseObject({ name: string(), version: string() })

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
  const { userId } = storeToRefs(useAuthStore())
  const featureFlagsStore = useFeatureFlagsStore()
  /** Cloud sync is a device choice, off by default. Settings > System > Experimental Features owns it. */
  const cloudSyncEnabled = computed(() => featureFlagsStore.isEnabled(CHARACTER_CARD_SYNC_FLAG.key))

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

  /** Applies card speech through the leader command so catalog invalidation precedes its saved voice. */
  async function writeRuntimeModules(modules: CardModuleDefaults) {
    const { consciousness, vision, speech, stageModel } = useRuntimeModuleStores()
    // Provider changes synchronously clear dependent selections. Assign the
    // resolved model and voice afterwards, including empty values.
    consciousness.activeProvider = modules.consciousness.provider
    consciousness.activeModel = modules.consciousness.model
    vision.activeProvider = modules.vision.provider
    vision.activeModel = modules.vision.model
    await speech.selectProviderModel(modules.speech.provider, modules.speech.model, modules.speech.voice_id)
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
    await writeRuntimeModules(moduleDefaults.value)
    try {
      if (authenticated)
        await configureAsDefaultsIfEmpty()
      else
        await unconfigureAuthenticationProviders()
      moduleDefaults.value = readRuntimeModules()
    }
    finally {
      appliedModules = undefined
      await applyActiveCardSettings()
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
    cards.value.set(id, card)
    if (id === activeCardId.value)
      await applyActiveCardSettings(card)

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
      await applyActiveCardSettings()
    return updated
  }

  async function updateActiveCardConsciousness(consciousness: AiriExtension['modules']['consciousness']) {
    await pendingAuthenticationSetup
    const updated = updateActiveCardModules(() => ({ consciousness }))
    if (updated)
      await applyActiveCardSettings()
    return updated
  }

  async function updateActiveCardVision(vision: AiriExtension['modules']['vision']) {
    await pendingAuthenticationSetup
    const updated = updateActiveCardModules(() => ({ vision }))
    if (updated)
      await applyActiveCardSettings()
    return updated
  }

  /**
   * Selects a vision provider for the active card with its catalog default.
   *
   * Only this explicit selection applies the default, and the card stores it,
   * so the runtime and the card keep the same model. A provider without a
   * default keeps an empty model until the user selects one.
   */
  async function selectActiveCardVisionProvider(provider: string) {
    await pendingAuthenticationSetup
    const vision = useVisionStore()
    vision.activeProvider = provider
    vision.resetModelSelection()
    await vision.loadModelsForProvider(provider)
    const model = useProviderStore().getDefaultModelForProvider(provider) ?? ''
    return await updateActiveCardVision({ provider, model })
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
      await applyActiveCardSettings()
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
      ...(existingExtension.wakeWords === undefined ? {} : { wakeWords: parse(array(wakeWordSchema), existingExtension.wakeWords) }),
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

  /**
   * The `default` card before the user edits it. Each device creates this card
   * with the same id, so synchronization compares a device's card with it to
   * find the edits of the user.
   */
  const builtInCard = computed(() => newAiriCard({
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
  }))

  /** The built-in card in every language. Only its parts that differ from all of them are edits. */
  const builtInVariants = computed(() => {
    const current = builtInCard.value
    return [...new Set([current.description, ...builtInDescriptions])].map(description => ({ ...current, description }))
  })

  // The leader writes these after each run. Every window reads them to show the cloud state of a card.
  /** The parts that the server accepted, by card id. */
  const syncedCardFields = ref<Record<string, DocumentFields>>({})
  /** The cards that the server refused in the last run. */
  const refusedCardIds = ref<string[]>([])

  /**
   * The cloud state of each card. It is empty without an account, and empty
   * while cloud sync is off, because nothing leaves the device then. Before
   * the first run ends, every card with content to send is `pending`.
   */
  const cardSyncStates = computed(() => {
    const states: Record<string, CardSyncState> = {}
    if (userId.value === 'local' || !cloudSyncEnabled.value)
      return states

    for (const [id, card] of cards.value) {
      if (refusedCardIds.value.includes(id))
        states[id] = 'refused'
      else
        states[id] = isEqual(splitCard(toRaw(card), id === 'default' ? builtInVariants.value : []), syncedCardFields.value[id] ?? {}) ? 'synced' : 'pending'
    }
    return states
  })

  /** The built-in content that `joinCard` lays a card's synchronized fields over. Only the `default` card has one. */
  function builtInFor(id: string) {
    return id === 'default' ? builtInCard.value : undefined
  }

  /** Turns the field list of a snapshot into the keyed shape that `joinCard` reads. */
  function fieldsOfSnapshot(snapshot: DocumentSnapshot): DocumentFields {
    return Object.fromEntries(snapshot.fields.map(field => [field.key, field.value]))
  }

  /**
   * Applies the card changes of one synchronization run to this renderer.
   *
   * The function changes the cards without an `await`. The caller computes the
   * changes from the same cards in the same task, so a local edit cannot occur
   * between the comparison and this write. Only the synchronization leader
   * calls it.
   *
   * The built-in card is the only card that synchronization keeps as its edits
   * alone. The parts that the changes lack come from the built-in card.
   *
   * @returns `activeCardChanged` is `true` when the content of the selected card changed, or another device deleted it. The caller must then call `activateCard`. `rejected` lists the cards that this device cannot read, from the server or from the local side of a conflict. A rejected card keeps its local content and gets no conflict copy.
   */
  function applySynchronizedCards(changes: LocalDocumentChanges) {
    const previousActiveCardId = activeCardId.value
    const rejected = new Set<string>()
    let activeCardChanged = false

    // A card that this device cannot read must not stop the other cards, and
    // the run must not treat it as deleted.
    function readCard(id: string, fields: DocumentFields) {
      try {
        return newAiriCard(parse(synchronizedCardSchema, joinCard(fields, builtInFor(id))))
      }
      catch (error) {
        console.warn('[character-card-sync] Ignored a card that this device cannot read:', id, errorMessageFrom(error))
        rejected.add(id)
      }
    }

    // Read every card before the first write. If either side of a conflict
    // cannot be read, the card keeps its local content and its earlier sync
    // state. Each round then finds the same conflict, so a rejected card gets
    // no copy.
    const upserts = Object.entries(changes.upserts).map(([id, fields]) => ({ id, card: readCard(id, fields) }))
    const copies = changes.conflictCopies.map(({ documentId, fields }) => ({ id: documentId, card: readCard(documentId, fields) }))

    for (const { id, card } of upserts) {
      if (!card || rejected.has(id))
        continue
      cards.value.set(id, card)
      activeCardChanged ||= id === previousActiveCardId
    }

    for (const { id, card } of copies) {
      if (!card || rejected.has(id))
        continue
      cards.value.set(nanoid(), newAiriCard({ ...card, name: t('settings.pages.card.sync.conflict_copy_name', { name: card.name }) }))
    }

    for (const id of changes.removals) {
      // The built-in card is the guaranteed fallback for every runtime profile.
      if (id !== 'default')
        cards.value.delete(id)
    }

    if (!cards.value.has(activeCardId.value))
      activeCardId.value = 'default'

    return { activeCardChanged: activeCardChanged || activeCardId.value !== previousActiveCardId, rejected: [...rejected] }
  }

  let syncClient: DocumentSyncClient | undefined
  /** The account that `syncedCardFields` belongs to. Only the leader sets it. */
  let syncedOwnerId: string | undefined
  let activeSynchronization: Promise<void> | undefined
  let hasQueuedSynchronization = false

  /**
   * Compares the local cards with the server and exchanges the changes. The
   * selected card is not synchronized, so each device keeps its own selection.
   *
   * A call during a run queues one more run and returns with the active run.
   * Errors are logged. The next request sends the same changes again. A user
   * without an account never sends a request.
   *
   * This synchronized action executes in the leader, one run at a time.
   */
  async function synchronizeCards() {
    if (activeSynchronization) {
      hasQueuedSynchronization = true
      return activeSynchronization
    }

    activeSynchronization = (async () => {
      do {
        hasQueuedSynchronization = false
        try {
          await runCardSynchronization(userId.value)
        }
        catch (error) {
          console.error('[character-card-sync] Synchronization failed:', errorMessageFrom(error))
        }
      } while (hasQueuedSynchronization)
    })()

    try {
      await activeSynchronization
    }
    finally {
      activeSynchronization = undefined
    }
  }

  async function runCardSynchronization(ownerId: string) {
    if (ownerId === 'local' || !cloudSyncEnabled.value)
      return

    syncClient ??= createDocumentSyncClient({ serverUrl: SERVER_URL, path: CARDS_PATH, fetch: authedFetch })
    // The cloud state of the earlier account does not describe this account.
    if (syncedOwnerId !== ownerId) {
      syncedOwnerId = ownerId
      syncedCardFields.value = {}
      refusedCardIds.value = []
    }

    const { state, refused } = await synchronize({
      client: syncClient,
      state: await documentSyncRepo.getState(SYNC_STATE_NAME, ownerId) ?? { documents: {} },
      // The new account starts its own run from the `userId` watcher.
      isCurrent: () => userId.value === ownerId,
      saveState: state => documentSyncRepo.saveState(SYNC_STATE_NAME, ownerId, state),
      // Each device creates the built-in card in its own language. Only its edits are synchronized.
      readLocal: () => Object.fromEntries([...toRaw(cards.value)].map(([id, card]) => [id, splitCard(toRaw(card), id === 'default' ? builtInVariants.value : [])])),
      async applyLocal(changes) {
        const { activeCardChanged, rejected } = applySynchronizedCards(changes)
        if (changes.conflictCopies.length > 0)
          toast.warning(t('settings.pages.card.sync.conflict_notice'))
        if (activeCardChanged)
          await activateCard(activeCardId.value)
        return { rejected }
      },
    })

    if (userId.value !== ownerId)
      return
    // A new object changes the store even when its content is equal. The leader
    // then publishes the whole store, each follower writes a new cards Map, and
    // the deep cards watcher requests another run. Keep the objects when nothing changed.
    const syncedFields = syncedValues(state)
    if (!isEqual(syncedFields, syncedCardFields.value))
      syncedCardFields.value = syncedFields
    if (!isEqual(refused, refusedCardIds.value))
      refusedCardIds.value = refused
    if (refused.length > 0)
      console.warn('[character-card-sync] The server refused these cards. They stay on this device:', refused)
  }

  /**
   * Replaces a card's content with the content it had at a past revision.
   *
   * The restore is an ordinary edit, not a special write. The next
   * synchronization run uploads it, and a field that another device changed
   * since the restore can still conflict, the same as any other edit.
   *
   * @returns `false` when the account has no cloud history, the card has no
   * local copy to update, or the server no longer has that revision.
   */
  async function restoreCardVersion(id: string, revision: number) {
    if (userId.value === 'local' || !cloudSyncEnabled.value)
      return false

    syncClient ??= createDocumentSyncClient({ serverUrl: SERVER_URL, path: CARDS_PATH, fetch: authedFetch })
    const snapshot = await syncClient.snapshot(id, revision)
    if (!snapshot)
      return false

    await pendingAuthenticationSetup
    if (!cards.value.has(id))
      return false

    // Every card field synchronizes, so the snapshot is the whole card at that
    // revision. Replace the card instead of merging it with `updateCard`. A
    // merge keeps the fields that were added after the revision.
    const card = newAiriCard(parse(synchronizedCardSchema, joinCard(fieldsOfSnapshot(snapshot), builtInFor(id))))
    cards.value.set(id, card)
    if (id === activeCardId.value)
      await applyActiveCardSettings(card)
    return true
  }

  /**
   * Brings back a card that synchronization removed from this device because
   * another device deleted it. The content comes from the server's record of
   * the card just before that deletion.
   *
   * The device has no synchronized state for this id anymore, so the next
   * run treats the restored card as new and uploads all of its content.
   *
   * @returns `false` when the account has no cloud history, the card is not
   * deleted on the server, or the content before the deletion is gone.
   */
  async function restoreDeletedCard(id: string) {
    if (userId.value === 'local' || !cloudSyncEnabled.value)
      return false

    syncClient ??= createDocumentSyncClient({ serverUrl: SERVER_URL, path: CARDS_PATH, fetch: authedFetch })
    const { documents } = await syncClient.list()
    const deleted = documents.find(document => document.id === id && document.deletedAt !== null)
    if (!deleted)
      return false

    const snapshot = await syncClient.snapshot(id, deleted.revision - 1)
    if (!snapshot)
      return false

    const card = parse(synchronizedCardSchema, joinCard(fieldsOfSnapshot(snapshot), builtInFor(id)))
    cards.value.set(id, newAiriCard(card))
    if (!cards.value.has(activeCardId.value))
      activeCardId.value = 'default'
    return true
  }

  /**
   * Lists the past revisions of a card, newest first, for a history view.
   *
   * This reads only. It does not change a card or its sync state, so every
   * window can call it directly without going through the leader.
   *
   * @returns `null` when the account has no cloud history for this card.
   */
  async function cardHistory(id: string, options?: { before?: number, limit?: number }) {
    if (userId.value === 'local' || !cloudSyncEnabled.value)
      return null

    syncClient ??= createDocumentSyncClient({ serverUrl: SERVER_URL, path: CARDS_PATH, fetch: authedFetch })
    return syncClient.history(id, options)
  }

  /**
   * Lists the cards that the server has as deleted for this account, each
   * with the name it had just before the deletion, for a "recently deleted" view.
   *
   * This reads only, the same as {@link cardHistory}.
   */
  async function deletedCards() {
    if (userId.value === 'local' || !cloudSyncEnabled.value)
      return []

    syncClient ??= createDocumentSyncClient({ serverUrl: SERVER_URL, path: CARDS_PATH, fetch: authedFetch })
    const client = syncClient
    const { documents } = await client.list()
    // The panel shows only the most recent deletions, so an account with a long history makes few requests.
    const deleted = documents.filter(document => document.deletedAt !== null).slice(0, 20)

    return Promise.all(deleted.map(async (document) => {
      const snapshot = await client.snapshot(document.id, document.revision - 1)
      const name = snapshot?.fields.find(field => field.key === '/name')?.value
      return { id: document.id, name: typeof name === 'string' ? name : document.id, deletedAt: document.deletedAt! }
    }))
  }

  async function requestCardSynchronization() {
    if (userId.value === 'local')
      return

    try {
      // The store action routes the run to the leader. A call to the local function would run in this window.
      await useAiriCardStore().synchronizeCards()
    }
    catch (error) {
      console.error('[character-card-sync] Failed to request synchronization:', errorMessageFrom(error))
    }
  }

  // Each renderer observes the synchronized identity and cards. The requests
  // go to the leader. A run that finds no difference changes nothing, so the
  // request that follows a remote change ends the sequence.
  watch(userId, requestCardSynchronization)
  watchDebounced(cards, requestCardSynchronization, { debounce: 1500, deep: true })
  // Turning the experimental flag on is itself a reason to run, because none
  // of the watchers above fired while it was off.
  watch(cloudSyncEnabled, (enabled) => {
    if (enabled)
      void requestCardSynchronization()
  })
  const visibility = useDocumentVisibility()
  watch(visibility, async (state) => {
    if (state === 'visible')
      await requestCardSynchronization()
  })
  // A restored session has its user id before this store exists, so no watcher
  // reports it. The store has no actions during setup, so wait for it.
  queueMicrotask(requestCardSynchronization)

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
    if (!cards.value.has('default'))
      cards.value.set('default', structuredClone(toRaw(builtInCard.value)))

    // Stored speech-noop can mean an intentional mute. Only the editor may
    // replace it with inheritance; the old placeholder has no provenance marker.
    // The active id and card map are persisted separately. Older versions
    // could delete the selected card without repairing its stored id.
    if (!cards.value.has(activeCardId.value))
      activeCardId.value = 'default'

    await applyActiveCardSettings()
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
    await applyActiveCardSettings()
    return true
  }

  /** Resolve the named character without changing the character selected by any window. */
  function getModules(characterId: string): CardModuleDefaults {
    const card = cards.value.get(characterId)
    if (!card)
      throw new Error('The session character is unavailable')
    const defaults = moduleDefaults.value
    if (!defaults)
      throw new Error('Character defaults are not initialized')
    return resolveModules(card.extensions.airi.modules, defaults)
  }

  function resolveModules(modules: AiriExtension['modules'], defaults: CardModuleDefaults): CardModuleDefaults {
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
    return resolved
  }

  function getSystemPrompt(characterId: string) {
    return resolveSystemPrompt(cards.value.get(characterId))
  }

  async function applyActiveCardSettings(newCard = activeCard.value) {
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
    const resolved = resolveModules(modules, defaults)
    await writeRuntimeModules(resolved)
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
    builtInCard,
    // A setup store replicates only the refs that it returns, so these two must be part of the result.
    syncedCardFields,
    refusedCardIds,
    cardSyncStates,
    cloudSyncEnabled,
    applySynchronizedCards,
    synchronizeCards,
    addCard,
    removeCard,
    updateCard,
    restoreCardVersion,
    restoreDeletedCard,
    cardHistory,
    deletedCards,
    updateActiveCardConsciousness,
    updateActiveCardDisplayModel,
    updateActiveCardSpeech,
    updateActiveCardVision,
    selectActiveCardVisionProvider,
    getCard,
    getModules,
    getSystemPrompt,
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
      'selectActiveCardVisionProvider',
      'updateCard',
      'restoreCardVersion',
      'restoreDeletedCard',
      'synchronizeCards',
    ],
    state: true,
  },
})
