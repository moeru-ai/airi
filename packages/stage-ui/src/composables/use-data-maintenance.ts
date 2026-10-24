import type { StoreGeneric } from 'pinia'

import type { DataExportAdapter, DataImportAdapter } from '../libs/data-transfer'

import { isStageTamagotchi } from '@proj-airi/stage-shared'
import { useSettingsScreenAmbientLight } from '@proj-airi/stage-shared/stores/screen-ambient-light'
import { useSettingsLive2d } from '@proj-airi/stage-ui-live2d/composables/live2d'
import { useLive2dParams } from '@proj-airi/stage-ui-live2d/stores/model-parameters'
import { useModelStore } from '@proj-airi/stage-ui-three'
import { pick } from 'es-toolkit'

import * as v from 'valibot'

import { useLive2DMotionMagicSettings } from '../features/motions/live2d'
import { createJsonDataExportAdapter, decodeJsonFile } from '../libs/data-transfer'
import { clearSherpawModelAssets } from '../libs/providers/providers/sherpaw/model-assets'
import { useChatStore } from '../stores/chat'
import { useChatSessionStore } from '../stores/chat/session-store'
import { useDisplayModelsStore } from '../stores/display-models'
import { useMcpStore } from '../stores/mcp'
import { useMemoryStore } from '../stores/memory'
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
import { appSettingsSchema, appSettingsSchemas, moduleSettingsSchema, moduleSettingsSchemas } from './data-maintenance-schemas'

interface StoreStateOwner {
  store: StoreGeneric
  state: () => Record<string, unknown>
  apply?: (state: Record<string, unknown>) => void | Promise<void>
}

type StoreBundleSchema = typeof appSettingsSchema | typeof moduleSettingsSchema
type ExportStoreBundle = Record<string, Record<string, unknown>>
type ValidatedStoreBundle = Record<string, Record<string, unknown>>

const serializedStoreStateSchema = v.pipe(
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
  v.record(v.string(), v.unknown()),
)

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

/**
 * Uses declared backup fields for capture, including writable computed settings outside Pinia state.
 *
 * @param store - Concrete TStore that supplies every field declared by TSchema.
 * @param schema - TSchema that selects the backup fields.
 */
function bindStoreFromSchema<
  TSchema extends v.StrictObjectSchema<v.ObjectEntries, undefined>,
  TStore extends StoreGeneric & Record<keyof TSchema['entries'], unknown>,
>(store: TStore, schema: TSchema) {
  return {
    store,
    state: () => pick<TStore, keyof TSchema['entries']>(store, v.keyof(schema).options),
  }
}

async function applyStoreBundle(bundle: ValidatedStoreBundle, owners: Record<string, StoreStateOwner>): Promise<void> {
  for (const [key, owner] of Object.entries(owners)) {
    const state = bundle[key]
    if (owner.apply) {
      await owner.apply(state)
    }
    else {
      owner.store.$patch(current => Object.assign(current, state))
    }
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

  const appSettingsOwners = {
    settings: bindStoreFromSchema(settingsStore, appSettingsSchemas.settings),
    audioDevices: bindStoreFromSchema(audioSettingsStore, appSettingsSchemas.audioDevices),
    live2dParameters: bindStoreFromSchema(live2dParamsStore, appSettingsSchemas.live2dParameters),
    live2dSettings: bindStoreFromSchema(live2dSettingsStore, appSettingsSchemas.live2dSettings),
    live2dMotionSettings: bindStoreFromSchema(live2dMagicSettingsStore, appSettingsSchemas.live2dMotionSettings),
    screenAmbientLight: bindStoreFromSchema(screenAmbientLightSettingsStore, appSettingsSchemas.screenAmbientLight),
    modulesConnection: bindStoreFromSchema(mcpStore, appSettingsSchemas.modulesConnection),
    onboarding: {
      ...bindStoreFromSchema(onboardingStore, appSettingsSchemas.onboarding),
      apply: (state) => {
        const onboarding = state as v.InferOutput<typeof appSettingsSchemas.onboarding>
        onboardingStore.resetSetupState()
        if (onboarding.hasCompletedSetup)
          onboardingStore.markSetupCompleted()
        else if (onboarding.hasSkippedSetup)
          onboardingStore.markSetupSkipped()
      },
    },
    characterCards: bindStoreFromSchema(airiCardStore, appSettingsSchemas.characterCards),
  } satisfies Record<keyof typeof appSettingsSchemas, StoreStateOwner>

  const moduleSettingsOwners = {
    hearing: bindStoreFromSchema(hearingStore, moduleSettingsSchemas.hearing),
    homeAssistant: {
      ...bindStoreFromSchema(homeAssistantStore, moduleSettingsSchemas.homeAssistant),
      apply: (state) => {
        const settings = state as v.InferOutput<typeof moduleSettingsSchemas.homeAssistant>
        homeAssistantStore.exposureMode = settings.exposureMode
        homeAssistantStore.$patch({
          enabled: settings.enabled,
          allowedEntities: settings.allowedEntities,
          deniedEntities: settings.deniedEntities,
        })
      },
    },
    speech: bindStoreFromSchema(speechStore, moduleSettingsSchemas.speech),
    consciousness: bindStoreFromSchema(consciousnessStore, moduleSettingsSchemas.consciousness),
    consciousnessSettings: bindStoreFromSchema(consciousnessSettingsStore, moduleSettingsSchemas.consciousnessSettings),
    twitter: bindStoreFromSchema(twitterStore, moduleSettingsSchemas.twitter),
    webSearch: bindStoreFromSchema(webSearchStore, moduleSettingsSchemas.webSearch),
    discord: bindStoreFromSchema(discordStore, moduleSettingsSchemas.discord),
    factorio: bindStoreFromSchema(factorioStore, moduleSettingsSchemas.factorio),
    recipes: bindStoreFromSchema(recipesStore, moduleSettingsSchemas.recipes),
    memory: {
      ...bindStoreFromSchema(memoryStore, moduleSettingsSchemas.memory),
      apply: (state) => {
        memoryStore.restoreState(state as v.InferOutput<typeof moduleSettingsSchemas.memory>)
      },
    },
  } satisfies Record<keyof typeof moduleSettingsSchemas, StoreStateOwner>

  function createStoreExportAdapter(
    schema: StoreBundleSchema,
    owners: Record<string, StoreStateOwner>,
    containsSensitiveInformation?: (bundle: ExportStoreBundle) => boolean,
  ): DataExportAdapter<ExportStoreBundle> {
    const read = async () => Object.fromEntries(Object.entries(owners).map(([key, owner]) => [key, v.parse(serializedStoreStateSchema, owner.state())]))
    const format = schema.entries.format.literal
    const adapter = createJsonDataExportAdapter(format, read, containsSensitiveInformation)
    return {
      ...adapter,
      encode: async (data, onProgress) => {
        v.parse(schema, { format, version: 1, data })
        return adapter.encode(data, onProgress)
      },
    }
  }

  function createStoreImportAdapter(
    schema: StoreBundleSchema,
    owners: Record<string, StoreStateOwner>,
    afterApply?: () => void | Promise<void>,
  ): DataImportAdapter<ValidatedStoreBundle> {
    return {
      decode: decodeJsonFile,
      validate: async value => v.parse(schema, value).data,
      apply: async (value) => {
        await applyStoreBundle(value, owners)
        await afterApply?.()
      },
    }
  }

  function createAppSettingsExportAdapter() {
    return createStoreExportAdapter(appSettingsSchema, appSettingsOwners)
  }

  function createAppSettingsImportAdapter() {
    return createStoreImportAdapter(appSettingsSchema, appSettingsOwners)
  }

  function createModuleSettingsExportAdapter() {
    return createStoreExportAdapter(moduleSettingsSchema, moduleSettingsOwners, moduleBundleContainsCredentials)
  }

  function createModuleSettingsImportAdapter() {
    return createStoreImportAdapter(moduleSettingsSchema, moduleSettingsOwners, () => {
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
