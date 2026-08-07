import type {
  ChatProvider,
  ChatProviderWithExtraOptions,
  EmbedProvider,
  EmbedProviderWithExtraOptions,
  SpeechProvider,
  SpeechProviderWithExtraOptions,
  TranscriptionProvider,
  TranscriptionProviderWithExtraOptions,
} from '@xsai-ext/providers/utils'
import type { ProgressInfo } from '@xsai-transformers/shared/types'

import type { ProviderSourceDeployment, ProviderSourcePricing } from '../libs/providers/source-metadata'
import type { ProviderOnboardingField } from '../libs/providers/types'

import { errorMessageFrom } from '@moeru/std'
import { isCustomProvidersDisabled, isStageCapacitor, isStageTamagotchi } from '@proj-airi/stage-shared'
import { computedAsync, useIntervalFn, useLocalStorage } from '@vueuse/core'
import { uniqBy } from 'es-toolkit'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { getProviderValidationIntervalMs, listProviders as listDefinedProviders } from '../libs/providers'
import { captureAnalyticsEvent, ensureAnalyticsInitialized, isAnalyticsAvailableInBuild } from './analytics/client'
import { useAuthStore } from './auth'
import { convertProviderDefinitionsToMetadata } from './providers/converters'
import { useSettingsAnalytics } from './settings/analytics'

/**
 * Classifies provider ids into bounded analytics buckets.
 */
function analyticsProviderMode(providerId: string): 'official' | 'custom' | 'unknown' {
  if (!providerId)
    return 'unknown'
  return providerId.startsWith('official-provider') || providerId.startsWith('vision-official-provider') ? 'official' : 'custom'
}

/**
 * Resolves the current app surface without importing the analytics store.
 */
function analyticsSurface(): 'web' | 'mobile' | 'electron' {
  if (isStageTamagotchi())
    return 'electron'

  if (isStageCapacitor())
    return 'mobile'

  return 'web'
}

/**
 * Checks analytics settings and initializes PostHog without loading build metadata.
 */
function canCaptureProviderAnalytics(): boolean {
  if (!isAnalyticsAvailableInBuild())
    return false

  const settingsAnalytics = useSettingsAnalytics()
  if (!settingsAnalytics.analyticsEnabled)
    return false

  return ensureAnalyticsInitialized(true)
}

/**
 * Emits model-list analytics from the provider store without loading build metadata.
 */
function trackModelListLoaded(properties: {
  provider_id: string
  provider_mode: 'official' | 'custom' | 'unknown'
  model_count: number
  duration_ms: number
}) {
  if (!canCaptureProviderAnalytics())
    return

  captureAnalyticsEvent('model_list_loaded', {
    ...properties,
    app_surface: analyticsSurface(),
  })
}

/**
 * Emits model-list failure analytics from the provider store without loading build metadata.
 */
function trackModelListFailed(properties: {
  provider_id: string
  provider_mode: 'official' | 'custom' | 'unknown'
  error_code: string
  duration_ms: number
}) {
  if (!canCaptureProviderAnalytics())
    return

  captureAnalyticsEvent('model_list_failed', {
    ...properties,
    app_surface: analyticsSurface(),
  })
}

export interface ProviderMetadata {
  id: string
  to?: string
  order?: number
  category: 'chat' | 'embed' | 'speech' | 'transcription' | 'vision'
  tasks: string[]
  nameKey: string // i18n key for provider name
  name: string // Default name (fallback)
  localizedName?: string
  descriptionKey: string // i18n key for description
  description: string // Default description (fallback)
  localizedDescription?: string
  configured?: boolean
  /**
   * Indicates whether the provider is available.
   * If not specified, the provider is always available.
   *
   * May be specified when any of the following criteria is required:
   *
   * Platform requirements:
   *
   * - app-* providers are only available on desktop, this is responsible for Tauri runtime checks
   * - web-* providers are only available on web, this means Node.js and Tauri should not be imported or used
   *
   * System spec requirements:
   *
   * - may requires WebGPU / NVIDIA / other types of GPU,
   *   on Web, WebGPU will automatically compiled to use targeting GPU hardware
   * - may requires significant amount of GPU memory to run, especially for
   *   using of small language models within browser or Tauri app
   * - may requires significant amount of memory to run, especially for those
   *   non-WebGPU supported environments.
   */
  isAvailableBy?: () => Promise<boolean> | boolean
  /**
   * Iconify JSON icon name for the provider.
   *
   * Icons are available for most of the AI provides under @proj-airi/lobe-icons.
   */
  icon?: string
  iconColor?: string
  /**
   * In case of having image instead of icon, you can specify the image URL here.
   */
  iconImage?: string
  defaultOptions?: () => Record<string, unknown>
  onboardingFields?: ProviderOnboardingField[]
  createProvider: (
    config: Record<string, unknown>,
  ) =>
    | ChatProvider
    | ChatProviderWithExtraOptions
    | EmbedProvider
    | EmbedProviderWithExtraOptions
    | SpeechProvider
    | SpeechProviderWithExtraOptions
    | TranscriptionProvider
    | TranscriptionProviderWithExtraOptions
    | Promise<ChatProvider>
    | Promise<ChatProviderWithExtraOptions>
    | Promise<EmbedProvider>
    | Promise<EmbedProviderWithExtraOptions>
    | Promise<SpeechProvider>
    | Promise<SpeechProviderWithExtraOptions>
    | Promise<TranscriptionProvider>
    | Promise<TranscriptionProviderWithExtraOptions>
  capabilities: {
    listModels?: (config: Record<string, unknown>) => Promise<ModelInfo[]>
    listVoices?: (config: Record<string, unknown>, model?: string) => Promise<VoiceInfo[]>
    loadModel?: (config: Record<string, unknown>, hooks?: { onProgress?: (progress: ProgressInfo) => Promise<void> | void }) => Promise<void>
  }
  validators: {
    /**
     * Validate a provider's configuration.
     *
     * PITFALL: When `skipChatPingCheck` is not set, the ChatCompletions validator
     * (if present) may send a real `generateText("ping")` request that consumes
     * API tokens. All automatic/background callers may consider pass `skipChatPingCheck: true`.
     */
    validateProviderConfig: (config: Record<string, unknown>, options?: { skipChatPingCheck?: boolean, onlyChatPingCheck?: boolean }) => Promise<{
      errors: unknown[]
      reason: string
      valid: boolean
    }> | {
      errors: unknown[]
      reason: string
      valid: boolean
    }
    /**
     * Whether the "skip chat ping check" checkbox should be shown in the UI.
     *
     * Automatically derived: `true` when the provider has a ChatCompletions
     * runtime validator AND `disableChatPingCheckUI` is not set on the definition.
     */
    chatPingCheckAvailable: boolean
  }
  /**
   * If true, the provider does not require user-provided credentials (e.g. API keys).
   * Used for official/built-in providers that authenticate via session.
   */
  requiresCredentials?: boolean
  transcriptionFeatures?: {
    supportsGenerate: boolean
    supportsStreamOutput: boolean
    supportsStreamInput: boolean
  }
  pricing?: ProviderSourcePricing
  deployment?: ProviderSourceDeployment
  beginnerRecommended?: boolean
}

export interface ModelInfo {
  id: string
  name: string
  provider: string
  description?: string
  capabilities?: string[]
  contextLength?: number
  deprecated?: boolean
}

export interface VoiceInfo {
  id: string
  name: string
  provider: string
  compatibleModels?: string[]
  description?: string
  gender?: string
  deprecated?: boolean
  previewURL?: string
  languages: {
    code: string
    title: string
  }[]
}

export interface ProviderRuntimeState {
  isConfigured: boolean
  validatedCredentialHash?: string
  models: ModelInfo[]
  isLoadingModels: boolean
  modelLoadError: string | null
}

export const useProvidersStore = defineStore('providers', () => {
  const providerCredentials = useLocalStorage<Record<string, Record<string, unknown>>>('settings/credentials/providers', {})
  const addedProviders = useLocalStorage<Record<string, boolean>>('settings/providers/added', {})
  const providerInstanceCache = ref<Record<string, unknown>>({})
  const { t } = useI18n()

  const authState = useAuthStore()
  const VISION_PROVIDER_ID_PREFIX = 'vision-'

  function createVisionProviderMetadata(metadata: ProviderMetadata): ProviderMetadata {
    return {
      ...metadata,
      id: `${VISION_PROVIDER_ID_PREFIX}${metadata.id}`,
      to: `/settings/providers/vision/${metadata.id}`,
      category: 'vision',
      tasks: Array.from(new Set([...metadata.tasks, 'vision', 'image-understanding'])),
    }
  }

  const definedProviders = listDefinedProviders()
  const providerMetadata = convertProviderDefinitionsToMetadata(
    definedProviders,
    t,
    {},
  )

  const providerValidationIntervalMsById = new Map<string, number>()
  for (const definition of definedProviders) {
    const intervalMs = getProviderValidationIntervalMs({
      definition,
      contextOptions: { t },
    })
    if (intervalMs && intervalMs > 0) {
      providerValidationIntervalMsById.set(definition.id, intervalMs)
      providerValidationIntervalMsById.set(`${VISION_PROVIDER_ID_PREFIX}${definition.id}`, intervalMs)
    }
  }

  for (const metadata of Object.values(providerMetadata)
    .filter(metadata => metadata.category === 'chat')
    .map(createVisionProviderMetadata)) {
    providerMetadata[metadata.id] = metadata
  }

  // const validatedCredentials = ref<Record<string, string>>({})
  const providerRuntimeState = ref<Record<string, ProviderRuntimeState>>({})
  const providerValidationInFlight = new Map<string, Promise<boolean>>()
  const providerRevalidationLoops = new Map<string, { pause: () => void, resume: () => void }>()

  // Server-driven availability overrides for providers whose visibility can
  // only be decided at runtime from the backend (e.g. the streaming TTS
  // provider, which exists only when `UNSPEECH_UPSTREAM.streaming` is
  // configured server-side). A `false` entry hides the provider from the
  // available lists regardless of its static `isAvailableBy`; an absent entry
  // means no override. Written by the auth-sync glue after it probes the
  // server. Reactive so the available/configured provider lists re-derive.
  const providerAvailabilityOverrides = ref<Record<string, boolean>>({})

  function setProviderAvailabilityOverride(providerId: string, available: boolean) {
    providerAvailabilityOverrides.value = { ...providerAvailabilityOverrides.value, [providerId]: available }
  }

  const configuredProviders = computed(() => {
    const result: Record<string, boolean> = {}
    for (const [key, state] of Object.entries(providerRuntimeState.value)) {
      result[key] = state.isConfigured
    }

    return result
  })

  function markProviderAdded(providerId: string) {
    addedProviders.value[providerId] = true
  }

  function unmarkProviderAdded(providerId: string) {
    delete addedProviders.value[providerId]
  }

  // Configuration validation functions
  async function validateProvider(providerId: string, options: { force?: boolean } = {}): Promise<boolean> {
    const metadata = providerMetadata[providerId]
    if (!metadata)
      return false

    // Web Speech API doesn't require credentials - use empty config if not present
    if (providerId === 'browser-web-speech-api') {
      if (!providerCredentials.value[providerId]) {
        providerCredentials.value[providerId] = getDefaultProviderConfig(providerId)
      }
    }

    const config = providerCredentials.value[providerId]
    if (!config && providerId !== 'browser-web-speech-api')
      return false

    const configString = JSON.stringify(config || {})
    const runtimeState = providerRuntimeState.value[providerId]
    const cacheKey = `${providerId}:${configString}`
    const forceValidation = options.force === true

    if (!forceValidation && runtimeState?.validatedCredentialHash === configString && typeof runtimeState.isConfigured === 'boolean')
      return runtimeState.isConfigured

    if (!forceValidation) {
      const pending = providerValidationInFlight.get(cacheKey)
      if (pending) {
        return pending
      }
    }

    const runValidation = async () => {
      // PITFALL: Please consider skip chat ping check during automatic/background validation,
      // since this can consume API tokens and may only be triggered
      // by user action (e.g. "Ping API" button on settings pages) or other user intentions.
      const validationResult = await metadata.validators.validateProviderConfig(config || {}, {
        skipChatPingCheck: true,
      })

      if (providerRuntimeState.value[providerId]) {
        providerRuntimeState.value[providerId].isConfigured = validationResult.valid
        providerRuntimeState.value[providerId].validatedCredentialHash = configString
        // Auto-mark Web Speech API as added if valid and available
        if (validationResult.valid && ['browser-web-speech-api', 'player2'].includes(providerId)) {
          markProviderAdded(providerId)
        }
      }

      return validationResult.valid
    }

    if (forceValidation) {
      return runValidation()
    }

    const task = runValidation()
    providerValidationInFlight.set(cacheKey, task)
    return task.finally(() => {
      providerValidationInFlight.delete(cacheKey)
    })
  }

  // Create computed properties for each provider's configuration status

  function getDefaultProviderConfig(providerId: string) {
    const metadata = providerMetadata[providerId]
    const defaultOptions = metadata?.defaultOptions?.() || {}
    return {
      ...defaultOptions,
      ...(Object.hasOwn(defaultOptions, 'baseUrl') ? {} : { baseUrl: '' }),
    }
  }

  // Initialize provider configurations
  function initializeProvider(providerId: string) {
    if (!providerCredentials.value[providerId]) {
      providerCredentials.value[providerId] = getDefaultProviderConfig(providerId)
    }
    if (!providerRuntimeState.value[providerId]) {
      providerRuntimeState.value[providerId] = {
        isConfigured: false,
        models: [],
        isLoadingModels: false,
        modelLoadError: null,
      }
    }
  }

  // Initialize all providers
  Object.keys(providerMetadata).forEach(initializeProvider)

  function stopRevalidationLoop(providerId: string) {
    const loop = providerRevalidationLoops.get(providerId)
    if (!loop)
      return
    loop.pause()
    providerRevalidationLoops.delete(providerId)
  }

  function reconcileUnlistedProviders() {
    for (const providerId of Object.keys(providerMetadata)) {
      if (shouldListProvider(providerId))
        continue
      stopRevalidationLoop(providerId)
      const runtimeState = providerRuntimeState.value[providerId]
      if (!runtimeState)
        continue
      runtimeState.isConfigured = false
      runtimeState.validatedCredentialHash = undefined
    }
  }

  function startPeriodicRuntimeValidation() {
    for (const [providerId, intervalMs] of providerValidationIntervalMsById.entries()) {
      if (!providerMetadata[providerId] || intervalMs <= 0)
        continue

      if (!shouldListProvider(providerId))
        continue

      if (providerRevalidationLoops.has(providerId)) {
        continue
      }

      const loop = useIntervalFn(() => {
        void validateProvider(providerId, { force: true })
      }, intervalMs, { immediate: false, immediateCallback: false })
      loop.resume()
      providerRevalidationLoops.set(providerId, loop)
    }
  }

  // Update configuration status for listed providers only.
  async function updateConfigurationStatus() {
    await Promise.all(Object.entries(providerMetadata)
      .filter(([providerId]) => shouldListProvider(providerId) || providerId === 'browser-web-speech-api')
      .map(async ([providerId]) => {
        try {
          if (providerRuntimeState.value[providerId]) {
            const isValid = await validateProvider(providerId)
            providerRuntimeState.value[providerId].isConfigured = isValid
          }
        }
        catch {
          if (providerRuntimeState.value[providerId]) {
            providerRuntimeState.value[providerId].isConfigured = false
          }
        }
      }))
  }

  async function refreshListedProviderValidation() {
    reconcileUnlistedProviders()
    await updateConfigurationStatus()
    startPeriodicRuntimeValidation()
  }

  // Call initially and watch for changes
  watch(providerCredentials, refreshListedProviderValidation, { deep: true, immediate: true })
  watch(addedProviders, refreshListedProviderValidation, { deep: true })
  watch(() => authState.isAuthenticated, refreshListedProviderValidation)

  // Available providers (only those that are properly configured)
  const availableProviders = computed(() => Object.keys(providerMetadata).filter(providerId => providerRuntimeState.value[providerId]?.isConfigured))

  // Store available models for each provider
  const availableModels = computed(() => {
    const result: Record<string, ModelInfo[]> = {}
    for (const [key, state] of Object.entries(providerRuntimeState.value)) {
      result[key] = state.models
    }
    return result
  })

  const isLoadingModels = computed(() => {
    const result: Record<string, boolean> = {}
    for (const [key, state] of Object.entries(providerRuntimeState.value)) {
      result[key] = state.isLoadingModels
    }
    return result
  })

  const modelLoadError = computed(() => {
    const result: Record<string, string | null> = {}
    for (const [key, state] of Object.entries(providerRuntimeState.value)) {
      result[key] = state.modelLoadError
    }
    return result
  })

  function deleteProvider(providerId: string) {
    delete providerCredentials.value[providerId]
    delete providerRuntimeState.value[providerId]
    unmarkProviderAdded(providerId)
  }

  function forceProviderConfigured(providerId: string) {
    if (providerRuntimeState.value[providerId]) {
      providerRuntimeState.value[providerId].isConfigured = true
      // Also cache the current config to prevent re-validation from overwriting
      const config = providerCredentials.value[providerId]
      if (config) {
        providerRuntimeState.value[providerId].validatedCredentialHash = JSON.stringify(config)
      }
    }
    markProviderAdded(providerId)
  }

  function setProviderUnconfigured(providerId: string) {
    if (providerRuntimeState.value[providerId]) {
      providerRuntimeState.value[providerId].isConfigured = false
      providerRuntimeState.value[providerId].validatedCredentialHash = undefined
    }
    unmarkProviderAdded(providerId)
  }

  async function resetProviderSettings() {
    providerCredentials.value = {}
    addedProviders.value = {}
    providerRuntimeState.value = {}

    Object.keys(providerMetadata).forEach(initializeProvider)
    providerRevalidationLoops.forEach(loop => loop.pause())
    providerRevalidationLoops.clear()
    await refreshListedProviderValidation()
  }

  // Function to fetch models for a specific provider
  async function fetchModelsForProvider(providerId: string) {
    const startedAt = Date.now()
    const metadata = providerMetadata[providerId]
    if (!metadata)
      return []

    const config = providerCredentials.value[providerId]
    if (!config && metadata.requiresCredentials !== false)
      return []

    const runtimeState = providerRuntimeState.value[providerId]
    if (runtimeState) {
      runtimeState.isLoadingModels = true
      runtimeState.modelLoadError = null
    }

    try {
      const models = metadata.capabilities.listModels ? await metadata.capabilities.listModels(config || {}) : []

      // Transform and store the models
      if (runtimeState) {
        runtimeState.models = uniqBy(models.filter(model => !!model.id), m => m.id)
          .map(model => ({
            id: model.id,
            name: model.name,
            description: model.description,
            contextLength: model.contextLength,
            deprecated: model.deprecated,
            provider: providerId,
          }))
        trackModelListLoaded({
          provider_id: providerId,
          provider_mode: analyticsProviderMode(providerId),
          model_count: runtimeState.models.length,
          duration_ms: Date.now() - startedAt,
        })
        return runtimeState.models
      }
      trackModelListLoaded({
        provider_id: providerId,
        provider_mode: analyticsProviderMode(providerId),
        model_count: 0,
        duration_ms: Date.now() - startedAt,
      })
      return []
    }
    catch (error) {
      console.error(`Error fetching models for ${providerId}:`, error)
      if (runtimeState) {
        runtimeState.modelLoadError = errorMessageFrom(error) ?? 'Unknown error'
      }
      trackModelListFailed({
        provider_id: providerId,
        provider_mode: analyticsProviderMode(providerId),
        error_code: 'provider_error',
        duration_ms: Date.now() - startedAt,
      })
      return []
    }
    finally {
      if (runtimeState) {
        runtimeState.isLoadingModels = false
      }
    }
  }

  // Get models for a specific provider
  function getModelsForProvider(providerId: string) {
    return providerRuntimeState.value[providerId]?.models || []
  }

  // Get all available models across all configured providers
  const allAvailableModels = computed(() => {
    const models: ModelInfo[] = []
    for (const providerId of availableProviders.value) {
      models.push(...(providerRuntimeState.value[providerId]?.models || []))
    }
    return models
  })

  // Load models for all configured providers
  async function loadModelsForConfiguredProviders() {
    for (const providerId of availableProviders.value) {
      if (providerMetadata[providerId].capabilities.listModels) {
        await fetchModelsForProvider(providerId)
      }
    }
  }
  const previousCredentialHashes = ref<Record<string, string>>({})

  // Watch for credential changes and refetch models accordingly
  watch(providerCredentials, (newCreds) => {
    const changedProviders: string[] = []

    for (const providerId in newCreds) {
      const currentConfig = newCreds[providerId]
      const currentHash = JSON.stringify(currentConfig)
      const previousHash = previousCredentialHashes.value[providerId]

      if (currentHash !== previousHash) {
        changedProviders.push(providerId)
        previousCredentialHashes.value[providerId] = currentHash
      }
    }

    for (const providerId of changedProviders) {
      // Since credentials changed, dispose the cached instance so new creds take effect.
      void disposeProviderInstance(providerId)

      // If the provider is configured and has the capability, refetch its models
      if (providerRuntimeState.value[providerId]?.isConfigured && providerMetadata[providerId]?.capabilities.listModels) {
        fetchModelsForProvider(providerId)
      }
    }
  }, { deep: true, immediate: true })

  // Function to get localized provider metadata
  function getProviderMetadata(providerId: string) {
    const metadata = providerMetadata[providerId]

    if (!metadata)
      throw new Error(`Provider metadata for ${providerId} not found`)

    return {
      ...metadata,
      localizedName: t(metadata.nameKey, metadata.name),
      localizedDescription: t(metadata.descriptionKey, metadata.description),
    }
  }

  // Non-throwing variant of getProviderMetadata for capability checks against
  // possibly-unset provider selections (fresh installs, reset state, deleted
  // providers persist '' or stale ids in localStorage). Callers that require
  // the provider to exist should keep using getProviderMetadata.
  //
  // Issue #1761: capability computeds used `getProviderMetadata(...)?.` as if
  // it returned undefined, but it throws — surfacing raw "Provider metadata
  // for  not found" errors whenever no provider was selected yet.
  function findProviderMetadata(providerId: string) {
    if (!providerId || !providerMetadata[providerId])
      return undefined

    return getProviderMetadata(providerId)
  }

  // Get all provider metadata in registry order for the settings page.
  const allProvidersMetadata = computed(() => {
    const localize = (metadata: ProviderMetadata) => ({
      ...metadata,
      localizedName: t(metadata.nameKey, metadata.name),
      localizedDescription: t(metadata.descriptionKey, metadata.description),
      configured: providerRuntimeState.value[metadata.id]?.isConfigured || false,
    })

    return definedProviders
      .filter(d => providerMetadata[d.id])
      .map(d => localize(providerMetadata[d.id]))
  })

  function getTranscriptionFeatures(providerId: string) {
    const metadata = providerMetadata[providerId]
    const features = metadata?.transcriptionFeatures

    return {
      supportsGenerate: features?.supportsGenerate ?? true,
      supportsStreamOutput: features?.supportsStreamOutput ?? false,
      supportsStreamInput: features?.supportsStreamInput ?? false,
    }
  }

  // Function to get provider object by provider id
  async function getProviderInstance<R extends
  | ChatProvider
  | ChatProviderWithExtraOptions
  | EmbedProvider
  | EmbedProviderWithExtraOptions
  | SpeechProvider
  | SpeechProviderWithExtraOptions
  | TranscriptionProvider
  | TranscriptionProviderWithExtraOptions,
  >(providerId: string): Promise<R> {
    const cached = providerInstanceCache.value[providerId] as R | undefined
    if (cached)
      return cached

    const metadata = providerMetadata[providerId]
    if (!metadata)
      throw new Error(`Provider metadata for ${providerId} not found`)

    // Providers that don't require credentials use empty config
    let config = providerCredentials.value[providerId]
    const noCredentials = metadata.requiresCredentials === false || providerId === 'browser-web-speech-api'
    if (!config && noCredentials) {
      config = getDefaultProviderConfig(providerId) || {}
      providerCredentials.value[providerId] = config
    }

    if (!config && !noCredentials)
      throw new Error(`Provider credentials for ${providerId} not found`)

    try {
      const instance = await metadata.createProvider(config || {}) as R
      providerInstanceCache.value[providerId] = instance
      return instance
    }
    catch (error) {
      console.error(`Error creating provider instance for ${providerId}:`, error)
      throw error
    }
  }

  async function disposeProviderInstance(providerId: string) {
    const instance = providerInstanceCache.value[providerId] as { dispose?: () => Promise<void> | void } | undefined
    if (instance?.dispose)
      await instance.dispose()

    delete providerInstanceCache.value[providerId]
  }

  const availableProvidersMetadata = computedAsync<ProviderMetadata[]>(async () => {
    // Spread-read the overrides synchronously so this re-runs when a
    // server-driven availability flips: computedAsync uses watchEffect, which
    // only tracks reactive reads before the first `await` — the per-provider
    // `isAvailableBy()` below runs after one, so reads inside it aren't tracked.
    const overrides = { ...providerAvailabilityOverrides.value }
    const providers: ProviderMetadata[] = []

    for (const provider of allProvidersMetadata.value) {
      if (overrides[provider.id] === false)
        continue

      const metadata = getProviderMetadata(provider.id)
      if (isCustomProvidersDisabled() && metadata.requiresCredentials !== false)
        continue

      const isAvailableBy = metadata.isAvailableBy || (() => true)

      const isAvailable = await isAvailableBy()
      if (isAvailable) {
        providers.push(provider)
      }
    }

    return providers
  }, [])

  const allChatProvidersMetadata = computed(() => {
    return availableProvidersMetadata.value.filter(metadata => metadata.category === 'chat')
  })

  const allAudioSpeechProvidersMetadata = computed(() => {
    return availableProvidersMetadata.value.filter(metadata => metadata.category === 'speech')
  })

  const allAudioTranscriptionProvidersMetadata = computed(() => {
    return availableProvidersMetadata.value.filter(metadata => metadata.category === 'transcription')
  })

  const allVisionProvidersMetadata = computed(() => {
    return availableProvidersMetadata.value.filter(metadata => metadata.category === 'vision')
  })

  const configuredChatProvidersMetadata = computed(() => {
    return allChatProvidersMetadata.value.filter(metadata => configuredProviders.value[metadata.id])
  })

  const configuredSpeechProvidersMetadata = computed(() => {
    return allAudioSpeechProvidersMetadata.value.filter(metadata => configuredProviders.value[metadata.id])
  })

  const configuredTranscriptionProvidersMetadata = computed(() => {
    return allAudioTranscriptionProvidersMetadata.value.filter(metadata => configuredProviders.value[metadata.id])
  })

  const configuredVisionProvidersMetadata = computed(() => {
    return allVisionProvidersMetadata.value.filter(metadata => configuredProviders.value[metadata.id])
  })

  function isProviderConfigDirty(providerId: string) {
    const config = providerCredentials.value[providerId]
    if (!config)
      return false

    const defaultOptions = getDefaultProviderConfig(providerId)
    return JSON.stringify(config) !== JSON.stringify(defaultOptions)
  }

  function shouldListProvider(providerId: string) {
    return !!addedProviders.value[providerId] || isProviderConfigDirty(providerId)
  }

  const persistedProvidersMetadata = computed(() => {
    return availableProvidersMetadata.value.filter(metadata => shouldListProvider(metadata.id))
  })

  const persistedChatProvidersMetadata = computed(() => {
    return persistedProvidersMetadata.value.filter(metadata => metadata.category === 'chat')
  })

  const persistedSpeechProvidersMetadata = computed(() => {
    return persistedProvidersMetadata.value.filter(metadata => metadata.category === 'speech')
  })

  const persistedTranscriptionProvidersMetadata = computed(() => {
    return persistedProvidersMetadata.value.filter(metadata => metadata.category === 'transcription')
  })

  const persistedVisionProvidersMetadata = computed(() => {
    return persistedProvidersMetadata.value.filter(metadata => metadata.category === 'vision')
  })

  function getProviderConfig(providerId: string) {
    return providerCredentials.value[providerId]
  }

  return {
    providers: providerCredentials,
    getProviderConfig,
    addedProviders,
    markProviderAdded,
    unmarkProviderAdded,
    deleteProvider,
    availableProviders,
    configuredProviders,
    providerRuntimeState,
    providerMetadata,
    getProviderMetadata,
    findProviderMetadata,
    getTranscriptionFeatures,
    allProvidersMetadata,
    initializeProvider,
    validateProvider,
    availableModels,
    isLoadingModels,
    modelLoadError,
    fetchModelsForProvider,
    getModelsForProvider,
    allAvailableModels,
    loadModelsForConfiguredProviders,
    getProviderInstance,
    disposeProviderInstance,
    resetProviderSettings,
    forceProviderConfigured,
    setProviderUnconfigured,
    setProviderAvailabilityOverride,
    availableProvidersMetadata,
    allChatProvidersMetadata,
    allAudioSpeechProvidersMetadata,
    allAudioTranscriptionProvidersMetadata,
    allVisionProvidersMetadata,
    configuredChatProvidersMetadata,
    configuredSpeechProvidersMetadata,
    configuredTranscriptionProvidersMetadata,
    configuredVisionProvidersMetadata,
    persistedProvidersMetadata,
    persistedChatProvidersMetadata,
    persistedSpeechProvidersMetadata,
    persistedTranscriptionProvidersMetadata,
    persistedVisionProvidersMetadata,
  }
})

// Export/Import provider configurations
export function exportProviderConfigs(): string {
  const config: Record<string, Record<string, unknown>> = {}
  const store = useProvidersStore()
  
  // Export all provider configs
  const providerIds = store.configuredChatProviders.map(p => p.id)
  providerIds.forEach(id => {
    config[id] = store.getProviderConfig(id) || {}
  })
  
  return JSON.stringify(config, null, 2)
}

export function importProviderConfigs(jsonString: string): boolean {
  try {
    const config = JSON.parse(jsonString) as Record<string, Record<string, unknown>>
    const store = useProvidersStore()
    
    Object.entries(config).forEach(([providerId, providerConfig]) => {
      store.setProviderConfig(providerId, providerConfig)
    })
    
    return true
  }
  catch (error) {
    console.error('Failed to import provider configs:', error)
    return false
  }
}
