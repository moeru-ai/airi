import type { StoreGeneric } from 'pinia'

import type { DataExportAdapter, DataImportAdapter, JsonValue } from '../libs/data-transfer'

import { isStageTamagotchi } from '@proj-airi/stage-shared'
import { useSettingsScreenAmbientLight } from '@proj-airi/stage-shared/stores/screen-ambient-light'
import { useSettingsLive2d } from '@proj-airi/stage-ui-live2d/composables/live2d'
import { useLive2dParams } from '@proj-airi/stage-ui-live2d/stores/model-parameters'
import { useModelStore } from '@proj-airi/stage-ui-three'

import * as v from 'valibot'

import { useLive2DMotionMagicSettings } from '../features/motions/live2d'
import { createJsonDataExportAdapter, decodeJsonFile } from '../libs/data-transfer'
import { clearSherpawModelAssets } from '../libs/providers/providers/sherpaw/model-assets'
import { useChatStore } from '../stores/chat'
import { useChatSessionStore } from '../stores/chat/session-store'
import { useDisplayModelsStore } from '../stores/display-models'
import { useMcpStore } from '../stores/mcp'
import { memoryName, useMemoryStore } from '../stores/memory'
import { useAiriCardStore } from '../stores/modules/airi-card'
import { useConsciousnessStore } from '../stores/modules/consciousness'
import { useConsciousnessSettingsStore } from '../stores/modules/consciousness-settings'
import { useDiscordStore } from '../stores/modules/discord'
import { useFactorioStore } from '../stores/modules/gaming-factorio'
import { useMinecraftStore } from '../stores/modules/gaming-minecraft'
import { useHearingStore } from '../stores/modules/hearing'
import { useHomeAssistantStore } from '../stores/modules/home-assistant'
import { useSpeechStore } from '../stores/modules/speech'
import { useTwitterStore } from '../stores/modules/twitter'
import { useWebSearchStore } from '../stores/modules/web-search'
import { useOnboardingStore } from '../stores/onboarding'
import { useProviderStore } from '../stores/providers/provider'
import { useRecipesStore } from '../stores/recipes'
import { useSettings, useSettingsAudioDevice } from '../stores/settings'
import { useVoiceprintStore } from '../stores/voiceprint'

const appSettingsFormat = 'airi-app-settings'
const moduleSettingsFormat = 'airi-module-settings'

const memoryEntrySchema = v.strictObject({
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
  description: v.string(),
  body: v.pipe(v.string(), v.trim(), v.minLength(1)),
  persona: v.optional(v.string()),
  updatedAt: v.number(),
})

const memoryStateSchema = v.pipe(
  v.strictObject({
    enabled: v.boolean(),
    entries: v.array(memoryEntrySchema),
  }),
  v.check((state) => {
    const seen = new Set<string>()
    return state.entries.every((entry) => {
      const key = `${entry.persona ?? ''}\u0000${entry.name}`
      if (entry.name !== memoryName(entry.name) || seen.has(key))
        return false
      seen.add(key)
      return true
    })
  }),
)

const recipeDecisionActionSchema = v.variant('kind', [
  v.strictObject({ kind: v.literal('stay-quiet') }),
  v.strictObject({ kind: v.literal('hint'), text: v.string() }),
  v.strictObject({ kind: v.literal('recipe'), recipeId: v.string() }),
])

const recipeDecisionQuestionSchema = v.union([
  v.strictObject({
    type: v.literal('noul'),
    instructions: v.string(),
    criteria: v.strictObject({ true: v.string(), false: v.string() }),
  }),
  v.strictObject({
    type: v.literal('choice'),
    instructions: v.string(),
    criteria: v.record(v.string(), v.string()),
  }),
])

const recipeSchema = v.strictObject({
  id: v.string(),
  name: v.string(),
  description: v.string(),
  instructions: v.string(),
  decision: v.optional(v.strictObject({
    question: recipeDecisionQuestionSchema,
    actions: v.record(v.string(), recipeDecisionActionSchema),
  })),
  keywords: v.array(v.string()),
  source: v.picklist(['user', 'model']),
  enabled: v.boolean(),
  approved: v.boolean(),
  background: v.optional(v.boolean()),
})

const recipesStateSchema = v.strictObject({
  recipes: v.array(recipeSchema),
  proposalsEnabled: v.boolean(),
})

const onboardingStateSchema = v.pipe(
  v.strictObject({
    hasCompletedSetup: v.boolean(),
    hasSkippedSetup: v.boolean(),
  }),
  v.check(state => !state.hasCompletedSetup || !state.hasSkippedSetup),
)

interface StoreStateOwner {
  store: StoreGeneric
  omittedKeys?: readonly string[]
  state?: () => Record<string, unknown>
  schema?: StoreStateSchema
  apply?: (state: Record<string, unknown>) => void | Promise<void>
}

type StoreStateSchema = v.GenericSchema<unknown, Record<string, unknown>>
type ExportStoreBundle = Record<string, Record<string, JsonValue>>
type ValidatedStoreBundle = Record<string, Record<string, unknown>>

const storeObjectTemplateSchema = v.record(v.string(), v.unknown())
const serializedStoreValueSchema = v.pipe(
  v.unknown(),
  v.stringifyJson({
    replacer: (_key, value) => {
      if (value instanceof Map)
        return [...value.entries()]
      if (value instanceof Set)
        return [...value.values()]
      return value
    },
  }),
  v.parseJson(),
)

function serializeStoreValue(value: unknown): JsonValue {
  return v.parse(serializedStoreValueSchema, value) as JsonValue
}

function captureStoreState(owner: StoreStateOwner): Record<string, JsonValue> {
  const omitted = new Set(owner.omittedKeys ?? [])
  const state: Record<string, JsonValue> = {}
  for (const [key, value] of Object.entries(owner.state?.() ?? owner.store.$state)) {
    if (omitted.has(key) || value === undefined)
      continue
    state[key] = serializeStoreValue(value)
  }
  return state
}

function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function moduleBundleContainsCredentials(bundle: ExportStoreBundle): boolean {
  return [
    bundle.twitter?.apiKey,
    bundle.twitter?.apiSecret,
    bundle.twitter?.accessToken,
    bundle.twitter?.accessTokenSecret,
    bundle.webSearch?.apiKey,
    bundle.discord?.token,
  ].some(isNonEmptyString)
}

function createStoreValueSchema(template: unknown): v.GenericSchema {
  if (template instanceof Map)
    return v.pipe(v.array(v.tuple([v.unknown(), v.unknown()])), v.transform(entries => new Map(entries)))
  if (template instanceof Set)
    return v.pipe(v.array(v.unknown()), v.transform(entries => new Set(entries)))
  if (Array.isArray(template))
    return v.array(template.length ? createStoreValueSchema(template[0]) : v.unknown())
  if (v.is(storeObjectTemplateSchema, template)) {
    if (Object.keys(template).length === 0)
      return v.record(v.string(), v.unknown())

    const fields: Record<string, v.GenericSchema> = {}
    for (const [key, value] of Object.entries(template)) {
      if (value !== undefined)
        fields[key] = createStoreValueSchema(value)
    }
    return v.strictObject(fields)
  }
  if (typeof template === 'string')
    return v.string()
  if (typeof template === 'number')
    return v.pipe(v.number(), v.finite())
  if (typeof template === 'boolean')
    return v.boolean()
  return v.unknown()
}

function createStoreStateSchema(owner: StoreStateOwner): StoreStateSchema {
  const omitted = new Set(owner.omittedKeys ?? [])
  const state = owner.state?.() ?? owner.store.$state
  const fields: Record<string, v.GenericSchema> = {}
  for (const [key, value] of Object.entries(state)) {
    if (!omitted.has(key) && value !== undefined)
      fields[key] = createStoreValueSchema(value)
  }
  return v.strictObject(fields)
}

function createStoreBundleSchema(format: string, owners: Record<string, StoreStateOwner>) {
  const stores: Record<string, StoreStateSchema> = {}
  for (const [key, owner] of Object.entries(owners))
    stores[key] = owner.schema ?? createStoreStateSchema(owner)

  return v.strictObject({
    format: v.literal(format),
    version: v.literal(1),
    data: v.strictObject(stores),
  })
}

function validateStoreBundle(value: unknown, format: string, owners: Record<string, StoreStateOwner>): ValidatedStoreBundle {
  return v.parse(createStoreBundleSchema(format, owners), value).data
}

async function applyStoreBundle(bundle: ValidatedStoreBundle, owners: Record<string, StoreStateOwner>): Promise<void> {
  for (const [key, owner] of Object.entries(owners)) {
    const state = bundle[key]
    if (owner.apply)
      await owner.apply(state)
    else
      owner.store.$patch(current => Object.assign(current, state))
  }
}

export function useDataMaintenance() {
  const chatStore = useChatSessionStore()
  const chatOrchestrator = useChatStore()
  const displayModelsStore = useDisplayModelsStore()
  const providersStore = useProviderStore()
  const settingsStore = useSettings()
  const audioSettingsStore = useSettingsAudioDevice()
  const live2dParamsStore = useLive2dParams()
  const live2dSettingsStore = useSettingsLive2d()
  const live2dMagicSettingsStore = useLive2DMotionMagicSettings()
  const screenAmbientLightSettingsStore = useSettingsScreenAmbientLight()
  const threeStore = useModelStore()
  const hearingStore = useHearingStore()
  const homeAssistantStore = useHomeAssistantStore()
  const speechStore = useSpeechStore()
  const consciousnessStore = useConsciousnessStore()
  const consciousnessSettingsStore = useConsciousnessSettingsStore()
  const twitterStore = useTwitterStore()
  const webSearchStore = useWebSearchStore()
  const discordStore = useDiscordStore()
  const factorioStore = useFactorioStore()
  const minecraftStore = useMinecraftStore()
  const mcpStore = useMcpStore()
  const onboardingStore = useOnboardingStore()
  const airiCardStore = useAiriCardStore()
  const memoryStore = useMemoryStore()
  const recipesStore = useRecipesStore()
  const voiceprintStore = useVoiceprintStore()

  async function deleteAllModels() {
    await displayModelsStore.resetDisplayModels()
    await settingsStore.updateStageModel()
  }

  async function resetProvidersSettings() {
    await providersStore.resetProviderSettings()
  }

  /** Attempts every independent reset and reports the first failure only after all operations settle. */
  async function resetModulesSettings() {
    // Schedule each reset separately so both synchronous errors and rejected
    // leader RPCs leave the other modules free to finish their cleanup.
    const results = await Promise.allSettled([
      () => hearingStore.resetState(),
      () => homeAssistantStore.resetState(),
      () => speechStore.resetState(),
      () => consciousnessStore.resetState(),
      () => consciousnessSettingsStore.resetState(),
      () => twitterStore.resetState(),
      () => webSearchStore.resetState(),
      () => discordStore.resetState(),
      () => factorioStore.resetState(),
      () => minecraftStore.resetState(),
      // Memories and recipes hold what the character learned about the owner.
      () => memoryStore.resetState(),
      () => recipesStore.resetState(),
    ].map(reset => Promise.resolve().then(reset)))
    const failure = results.find(result => result.status === 'rejected')
    if (failure)
      throw failure.reason
  }

  async function deleteAllChatSessions() {
    await chatOrchestrator.cancelPendingSends()
    await chatStore.resetAllSessions()
  }

  async function resetSettingsState() {
    await settingsStore.resetState()
    audioSettingsStore.resetState()
    live2dParamsStore.resetState()
    live2dSettingsStore.resetState()
    live2dMagicSettingsStore.resetState()
    screenAmbientLightSettingsStore.resetState()
    threeStore.resetModelStore()
    mcpStore.resetState()
    onboardingStore.resetSetupState()
    airiCardStore.resetState()
  }

  async function deleteAllData() {
    // The voiceprint identifies the user. Remove it first, so a failed cleanup step below cannot keep it.
    voiceprintStore.remove()
    await deleteAllModels()
    await resetProvidersSettings()
    await resetModulesSettings()
    await deleteAllChatSessions()
    await resetSettingsState()
    await clearSherpawModelAssets()
  }

  async function resetDesktopApplicationState() {
    if (!isStageTamagotchi())
      return

    await resetSettingsState()
    await resetModulesSettings()
  }

  const appSettingsOwners: Record<string, StoreStateOwner> = {
    settings: { store: settingsStore, omittedKeys: ['stageModelSelectedDisplayModel', 'stageModelSelectedUrl'] },
    audioDevices: {
      store: audioSettingsStore,
      state: () => ({
        selectedAudioInput: audioSettingsStore.selectedAudioInput,
        enabled: audioSettingsStore.enabled,
      }),
    },
    live2dParameters: { store: live2dParamsStore, omittedKeys: ['shouldUpdateViewHooks'] },
    live2dSettings: { store: live2dSettingsStore },
    live2dMotionSettings: { store: live2dMagicSettingsStore },
    screenAmbientLight: { store: screenAmbientLightSettingsStore },
    modulesConnection: { store: mcpStore, omittedKeys: ['connected'] },
    onboarding: {
      store: onboardingStore,
      schema: onboardingStateSchema,
      state: () => ({
        hasCompletedSetup: onboardingStore.hasCompletedSetup,
        hasSkippedSetup: onboardingStore.hasSkippedSetup,
      }),
      apply: (state) => {
        const onboarding = state as v.InferOutput<typeof onboardingStateSchema>
        onboardingStore.resetSetupState()
        if (onboarding.hasCompletedSetup)
          onboardingStore.markSetupCompleted()
        else if (onboarding.hasSkippedSetup)
          onboardingStore.markSetupSkipped()
      },
    },
    characterCards: { store: airiCardStore, omittedKeys: ['ready', 'selectedAvatarModelId', 'activeLive2DModelControls'] },
  }

  const moduleSettingsOwners: Record<string, StoreStateOwner> = {
    hearing: { store: hearingStore, omittedKeys: ['transcriptionModelSearchQuery', 'verboseJsonNotSupported'] },
    homeAssistant: { store: homeAssistantStore, omittedKeys: ['hasCredentials'] },
    speech: { store: speechStore, omittedKeys: ['modelSearchQuery'] },
    consciousness: { store: consciousnessStore, omittedKeys: ['expandedDescriptions', 'modelSearchQuery'] },
    consciousnessSettings: { store: consciousnessSettingsStore },
    twitter: { store: twitterStore },
    webSearch: { store: webSearchStore },
    discord: { store: discordStore },
    factorio: { store: factorioStore },
    recipes: {
      store: recipesStore,
      schema: recipesStateSchema,
    },
    memory: {
      store: memoryStore,
      schema: memoryStateSchema,
      state: () => ({ enabled: memoryStore.enabled, entries: memoryStore.entries }),
      apply: (state) => {
        memoryStore.restoreState(state as v.InferOutput<typeof memoryStateSchema>)
      },
    },
  }

  function createStoreExportAdapter(
    format: string,
    owners: Record<string, StoreStateOwner>,
    containsSensitiveInformation?: (bundle: ExportStoreBundle) => boolean,
  ): DataExportAdapter<ExportStoreBundle> {
    const read = async () => Object.fromEntries(Object.entries(owners).map(([key, owner]) => [key, captureStoreState(owner)]))
    return createJsonDataExportAdapter(format, read, containsSensitiveInformation)
  }

  function createStoreImportAdapter(
    format: string,
    owners: Record<string, StoreStateOwner>,
    afterApply?: () => void | Promise<void>,
  ): DataImportAdapter<ValidatedStoreBundle> {
    return {
      decode: decodeJsonFile,
      validate: async value => validateStoreBundle(value, format, owners),
      apply: async (value) => {
        await applyStoreBundle(value, owners)
        await afterApply?.()
      },
    }
  }

  function createAppSettingsExportAdapter() {
    return createStoreExportAdapter(appSettingsFormat, appSettingsOwners)
  }

  function createAppSettingsImportAdapter() {
    return createStoreImportAdapter(appSettingsFormat, appSettingsOwners)
  }

  function createModuleSettingsExportAdapter() {
    return createStoreExportAdapter(moduleSettingsFormat, moduleSettingsOwners, moduleBundleContainsCredentials)
  }

  function createModuleSettingsImportAdapter() {
    return createStoreImportAdapter(moduleSettingsFormat, moduleSettingsOwners, () => {
      twitterStore.saveSettings()
      discordStore.saveSettings()
      factorioStore.saveSettings()
    })
  }

  return {
    deleteAllModels,
    resetProvidersSettings,
    resetModulesSettings,
    deleteAllChatSessions,
    createAppSettingsExportAdapter,
    createAppSettingsImportAdapter,
    createModuleSettingsExportAdapter,
    createModuleSettingsImportAdapter,
    deleteAllData,
    resetDesktopApplicationState,
  }
}
