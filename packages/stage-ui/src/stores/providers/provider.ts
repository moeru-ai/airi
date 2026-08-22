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
import type {} from 'pinia-plugin-synced'

import type { ProviderMetadata, ProviderValidationPlan } from '../../libs/providers'
import type { ModelInfo, ProviderDefinition, ProviderInstance, VoiceInfo } from '../../libs/providers/types'

import { errorMessageFrom } from '@moeru/std'
import { isCustomProvidersDisabled } from '@proj-airi/stage-shared'
import { computedAsync, useIntervalFn } from '@vueuse/core'
import { listModels } from '@xsai/model'
import { uniqBy } from 'es-toolkit'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  CHAT_COMPLETIONS_VALIDATOR_ID,
  getProviderValidationIntervalMs,
  getValidatorsOfProvider,
  isModelProvider,
  listProviders as listDefinedProviders,
  validateProvider as runProviderValidation,
} from '../../libs/providers'
import { selectProviderMetadata, selectProvidersMetadata } from '../../libs/providers/metadata'
import { useProviderConfigStore } from './config'
import { normalizeProviderConfigDefaults } from './config-defaults'

export type { ModelInfo, VoiceInfo } from '../../libs/providers/types'

/** Serializable request and model-discovery state for one provider instance. */
export interface ProviderRuntimeState {
  validatedCredentialHash?: string
  models: ModelInfo[]
  modelStatus: 'idle' | 'loading' | 'ready' | 'error'
  modelError: string | null
}

function cloneReadyModelSnapshot(runtimeState: ProviderRuntimeState | undefined): ModelInfo[] {
  if (runtimeState?.modelStatus !== 'ready')
    return []

  return cloneModelSnapshot(runtimeState.models)
}

function cloneModelSnapshot(models: readonly ModelInfo[]): ModelInfo[] {
  return models.map(({ capabilities, ...model }) => ({
    ...model,
    ...(capabilities ? { capabilities: [...capabilities] } : {}),
  }))
}

/** Stable fallback for reactive consumers when a provider has no cached catalog. */
const emptyProviderModels: ModelInfo[] = []
Object.freeze(emptyProviderModels)

// Only the provider data plane crosses renderer boundaries. Async derived refs
// stay in useProviderStore and recompute locally instead of being patched as
// authoritative state by pinia-plugin-synced.
const useProviderStateStore = defineStore('provider-state', () => {
  const runtime = ref<Record<string, ProviderRuntimeState>>({})
  const availabilityOverrides = ref<Record<string, boolean>>({})

  return {
    runtime,
    availabilityOverrides,
  }
}, {
  synced: {
    state: true,
  },
})

const PROVIDERS_WITH_SELECTION_IN_FIXED_MODEL_CATALOG = new Set([
  'funasr-audio-transcription',
  'openai-audio-transcription',
])

function modelCatalogCredentialHash(providerDefinitionId: string, config: Record<string, unknown>) {
  if (!PROVIDERS_WITH_SELECTION_IN_FIXED_MODEL_CATALOG.has(providerDefinitionId))
    return JSON.stringify(config)

  const { model: _selectedModel, ...connectionConfig } = config
  return JSON.stringify(connectionConfig)
}

/**
 * Owns executable provider instances and inference-specific runtime state.
 *
 * Provider definitions remain in the static registry. Serializable provider
 * configuration remains in {@link useProviderConfigStore}.
 */
export const useProviderStore = defineStore('provider', () => {
  const providerConfigStore = useProviderConfigStore()
  const providerStateStore = useProviderStateStore()
  const providerCredentials = computed(() => providerConfigStore.configs)
  const addedProviders = computed(() => providerConfigStore.addedProviders)
  // Provider instances contain functions and transport handles. Keep this map
  // private so it never enters Pinia state.
  const providerInstanceCache = new Map<string, unknown>()
  const { t } = useI18n()

  const VISION_PROVIDER_ID_PREFIX = 'vision-'

  function getProviderDefinitionId(providerId: string) {
    const configuredProvider = providerConfigStore.providers[providerId]
    if (configuredProvider)
      return configuredProvider.definitionId

    if (providerId.startsWith(VISION_PROVIDER_ID_PREFIX))
      return providerId.slice(VISION_PROVIDER_ID_PREFIX.length)

    return providerId
  }

  const definedProviders = listDefinedProviders()
  const providerDefinitions = Object.fromEntries(
    definedProviders.map(definition => [definition.id, definition]),
  ) as Record<string, ProviderDefinition>
  const providerMetadata = selectProvidersMetadata(definedProviders, t)

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

  for (const definition of definedProviders.filter(definition => providerMetadata[definition.id]?.category === 'chat')) {
    const id = `${VISION_PROVIDER_ID_PREFIX}${definition.id}`
    providerMetadata[id] = selectProviderMetadata(definition, t, {
      id,
      to: `/settings/providers/vision/${definition.id}`,
      category: 'vision',
      tasks: Array.from(new Set([...definition.tasks, 'vision', 'image-understanding'])),
    })
  }

  const providerRuntimeState = computed({
    get: () => providerStateStore.runtime,
    set: value => providerStateStore.runtime = value,
  })
  const providerValidationInFlight = new Map<string, Promise<boolean>>()
  const providerVoiceListInFlight = new Map<string, Promise<VoiceInfo[]>>()
  const providerRevalidationLoops = new Map<string, { pause: () => void, resume: () => void }>()
  // Model discovery is isolated per provider. Only the newest request may publish
  // cache or status state; older responses retain no ownership after a new load starts.
  let nextModelListRequestId = 0
  const latestModelListRequestIds = new Map<string, number>()
  const latestModelListRequests = new Map<string, Promise<ModelInfo[]>>()

  // Server-driven availability overrides for providers whose visibility can
  // only be decided at runtime from the backend (e.g. the streaming TTS
  // provider, which exists only when `UNSPEECH_UPSTREAM.streaming` is
  // configured server-side). A `false` entry hides the provider from the
  // available lists regardless of its static `isAvailableBy`; an absent entry
  // means no override. Written by the auth-sync glue after it probes the
  // server. Reactive so the available/configured provider lists re-derive.
  const providerAvailabilityOverrides = computed({
    get: () => providerStateStore.availabilityOverrides,
    set: value => providerStateStore.availabilityOverrides = value,
  })

  function setProviderAvailabilityOverride(providerId: string, available: boolean) {
    providerAvailabilityOverrides.value = { ...providerAvailabilityOverrides.value, [providerId]: available }
  }

  function markProviderAdded(providerId: string) {
    providerConfigStore.markProviderAdded(providerId)
  }

  function unmarkProviderAdded(providerId: string) {
    providerConfigStore.unmarkProviderAdded(providerId)
  }

  function findProviderDefinition(providerId: string) {
    if (!providerId)
      return undefined
    return providerDefinitions[getProviderDefinitionId(providerId)]
  }

  function getProviderDefinition(providerId: string) {
    const definition = findProviderDefinition(providerId)
    if (!definition)
      throw new Error(`Provider definition for ${providerId} not found`)
    return definition
  }

  function appendUniqueReason(reasons: string[], next: string) {
    if (next && !reasons.includes(next))
      reasons.push(next)
  }

  function validationResultFromPlan(plan: ProviderValidationPlan, configOnly: boolean) {
    const invalidSteps = plan.steps.filter(step => step.status === 'invalid' && (!configOnly || step.kind === 'config'))
    return {
      errors: invalidSteps.map(step => new Error(step.reason || `${step.id} is invalid`)),
      reason: invalidSteps.map(step => step.reason).filter(Boolean).join('; '),
      valid: invalidSteps.length === 0,
    }
  }

  async function validateProviderConfig(
    providerId: string,
    config: Record<string, unknown>,
    options: { onlyChatPingCheck?: boolean, skipChatPingCheck?: boolean } = {},
  ) {
    const definition = getProviderDefinition(providerId)
    const schemaDefaults = getDefaultProviderConfig(providerId)
    const plan = getValidatorsOfProvider({
      definition,
      config,
      schemaDefaults,
      contextOptions: { t },
    })

    if (options.onlyChatPingCheck) {
      plan.configValidators = []
      plan.providerValidators = plan.providerValidators.filter(validator => validator.id.includes(CHAT_COMPLETIONS_VALIDATOR_ID))
      plan.steps = plan.steps.filter(step => step.id.includes(CHAT_COMPLETIONS_VALIDATOR_ID))
    }
    else if (options.skipChatPingCheck) {
      plan.providerValidators = plan.providerValidators.filter(validator => !validator.id.includes(CHAT_COMPLETIONS_VALIDATOR_ID))
      plan.steps = plan.steps.filter(step => !step.id.includes(CHAT_COMPLETIONS_VALIDATOR_ID))
    }

    if (plan.providerValidators.length > 0 || plan.configValidators.length > 0)
      await runProviderValidation(plan, { t })

    const configOnly = !options.onlyChatPingCheck && !plan.shouldValidate
    const result = validationResultFromPlan(plan, configOnly)
    if (result.valid)
      return result

    const reasons = result.reason ? result.reason.split('; ') : []
    const defaultBaseUrl = typeof schemaDefaults.baseUrl === 'string' ? schemaDefaults.baseUrl.trim() : ''
    if (defaultBaseUrl && reasons.some(reason => reason.includes('Base URL is required')))
      appendUniqueReason(reasons, `Default to ${defaultBaseUrl}.`)

    if (!configOnly && plan.steps.some(step => step.id === 'openai-compatible:check-connectivity' && step.status === 'invalid')) {
      const troubleshooting = definition.business?.({ t })?.troubleshooting?.validators?.openaiCompatibleCheckConnectivity?.content ?? ''
      appendUniqueReason(reasons, troubleshooting)
    }

    return {
      ...result,
      reason: reasons.join('; '),
    }
  }

  function hasManualProviderValidators(providerId: string) {
    const definition = findProviderDefinition(providerId)
    if (!definition || definition.disableChatPingCheckUI)
      return false
    return (definition.validators?.validateProvider ?? [])
      .some(createValidator => createValidator({ t }).id.includes(CHAT_COMPLETIONS_VALIDATOR_ID))
  }

  function supportsModelListing(providerId: string) {
    return findProviderDefinition(providerId) !== undefined
  }

  // Configuration validation functions
  async function validateProvider(providerId: string, options: { force?: boolean } = {}): Promise<boolean> {
    const definition = findProviderDefinition(providerId)
    if (!definition)
      return false

    // Web Speech API doesn't require credentials - use empty config if not present
    if (providerId === 'browser-web-speech-api') {
      if (!providerCredentials.value[providerId]) {
        providerConfigStore.ensureProvider(providerId, providerId, getDefaultProviderConfig(providerId))
      }
    }

    const config = providerCredentials.value[providerId]
    if (!config && providerId !== 'browser-web-speech-api')
      return false

    initializeProviderRuntimeState(providerId)
    const configString = JSON.stringify(config || {})
    const runtimeState = providerRuntimeState.value[providerId]
    const configuredProvider = providerConfigStore.providers[providerId]
    const cacheKey = `${providerId}:${configString}`
    const forceValidation = options.force === true

    if (!forceValidation && runtimeState?.validatedCredentialHash === configString && configuredProvider?.status !== 'validating')
      return configuredProvider?.status === 'configured'

    if (!forceValidation) {
      const pending = providerValidationInFlight.get(cacheKey)
      if (pending) {
        return pending
      }
    }

    const runValidation = async () => {
      providerConfigStore.setProviderStatus(providerId, 'validating')

      // PITFALL: Please consider skip chat ping check during automatic/background validation,
      // since this can consume API tokens and may only be triggered
      // by user action (e.g. "Ping API" button on settings pages) or other user intentions.
      let validationResult
      try {
        validationResult = await validateProviderConfig(providerId, config || {}, {
          skipChatPingCheck: true,
        })
      }
      catch (error) {
        providerConfigStore.setProviderStatus(providerId, 'invalid')
        throw error
      }

      if (providerRuntimeState.value[providerId]) {
        providerRuntimeState.value[providerId].validatedCredentialHash = configString
        providerConfigStore.setProviderStatus(providerId, validationResult.valid ? 'configured' : 'invalid')
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
    const definitionId = getProviderDefinitionId(providerId)
    const defaultOptions = providerMetadata[providerId]?.defaultConfig
      ?? providerMetadata[definitionId]?.defaultConfig
      ?? {}
    return {
      ...defaultOptions,
      ...(Object.hasOwn(defaultOptions, 'baseUrl') ? {} : { baseUrl: '' }),
    }
  }

  function initializeProviderRuntimeState(providerId: string) {
    if (!providerRuntimeState.value[providerId]) {
      providerRuntimeState.value[providerId] = {
        models: [],
        modelStatus: 'idle',
        modelError: null,
      }
    }
  }

  // Initialize provider configurations
  function initializeProvider(providerId: string) {
    if (!providerCredentials.value[providerId]) {
      const definitionId = getProviderDefinitionId(providerId)
      providerConfigStore.ensureProvider(providerId, definitionId, getDefaultProviderConfig(providerId))
    }
    initializeProviderRuntimeState(providerId)
  }

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
      providerConfigStore.setProviderStatus(providerId, 'unconfigured')
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
        void useProviderStore().validateProvider(providerId, { force: true })
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
            providerConfigStore.setProviderStatus(providerId, isValid ? 'configured' : 'invalid')
          }
        }
        catch {
          if (providerRuntimeState.value[providerId]) {
            providerConfigStore.setProviderStatus(providerId, 'invalid')
          }
        }
      }))
  }

  async function refreshListedProviderValidation() {
    reconcileUnlistedProviders()
    await updateConfigurationStatus()
    startPeriodicRuntimeValidation()
  }

  // Available providers (only those that are properly configured)
  const availableProviders = computed(() => Object.values(providerConfigStore.providers)
    .filter(provider => provider.status === 'configured')
    .map(provider => provider.id))

  const isLoadingModels = computed(() => {
    const result: Record<string, boolean> = {}
    for (const [key, state] of Object.entries(providerRuntimeState.value)) {
      result[key] = state.modelStatus === 'loading'
    }
    return result
  })

  const modelLoadError = computed(() => {
    const result: Record<string, string | null> = {}
    for (const [key, state] of Object.entries(providerRuntimeState.value)) {
      result[key] = state.modelError
    }
    return result
  })

  function deleteProvider(providerId: string) {
    void providerConfigStore.removeProvider(providerId)
    latestModelListRequestIds.delete(providerId)
    latestModelListRequests.delete(providerId)
    delete providerRuntimeState.value[providerId]
  }

  async function forceProviderConfigured(providerId: string) {
    if (providerRuntimeState.value[providerId]) {
      // Also cache the current config to prevent re-validation from overwriting
      const config = providerCredentials.value[providerId]
      if (config) {
        providerRuntimeState.value[providerId].validatedCredentialHash = JSON.stringify(config)
      }
    }
    providerConfigStore.setProviderStatus(providerId, 'configured')
    markProviderAdded(providerId)
  }

  function setProviderUnconfigured(providerId: string) {
    if (providerRuntimeState.value[providerId]) {
      providerRuntimeState.value[providerId].validatedCredentialHash = undefined
    }
    providerConfigStore.setProviderStatus(providerId, 'unconfigured')
    unmarkProviderAdded(providerId)
  }

  async function resetProviderSettings() {
    await providerConfigStore.resetProviders()
    latestModelListRequestIds.clear()
    latestModelListRequests.clear()
    providerRuntimeState.value = {}

    providerRevalidationLoops.forEach(loop => loop.pause())
    providerRevalidationLoops.clear()
    await refreshListedProviderValidation()
  }

  function normalizeProviderModels(providerId: string, models: Array<{
    context_length?: number
    contextLength?: number
    deprecated?: boolean
    description?: string
    display_name?: string
    id: string
    name?: string
  }>) {
    return models.map(model => ({
      id: model.id,
      name: model.name ?? model.display_name ?? model.id,
      provider: providerId,
      description: model.description ?? '',
      contextLength: model.contextLength ?? model.context_length ?? 0,
      deprecated: model.deprecated ?? false,
    }))
  }

  async function disposeTemporaryProvider(provider: ProviderInstance) {
    await (provider as ProviderInstance & { dispose?: () => Promise<void> | void }).dispose?.()
  }

  async function listProviderModels(providerId: string, config: Record<string, unknown>) {
    const definition = getProviderDefinition(providerId)
    const provider = await definition.createProvider(config)
    try {
      if (definition.extraMethods?.listModels) {
        const models = await definition.extraMethods.listModels(config, provider, { t })
        return normalizeProviderModels(providerId, models)
      }

      if (isModelProvider(provider))
        return normalizeProviderModels(providerId, await listModels(provider.model()))

      const baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl.trim() : ''
      const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
      if (!baseUrl)
        return []

      return normalizeProviderModels(providerId, await listModels({
        baseURL: baseUrl,
        ...(apiKey ? { apiKey } : {}),
      }))
    }
    finally {
      await disposeTemporaryProvider(provider)
    }
  }

  async function listProviderVoices(providerId: string, model?: string) {
    const definition = getProviderDefinition(providerId)
    const listVoices = definition.extraMethods?.listVoices
    if (!listVoices)
      return []

    const config = providerConfigStore.getProviderConfig(providerId) ?? {}
    const requestKey = JSON.stringify([providerId, model ?? null, config])
    const pending = providerVoiceListInFlight.get(requestKey)
    if (pending)
      return pending

    const task = (async () => {
      const provider = await definition.createProvider(config)
      try {
        return await listVoices(config, provider, model)
      }
      finally {
        await disposeTemporaryProvider(provider)
      }
    })()
    providerVoiceListInFlight.set(requestKey, task)

    return task.finally(() => {
      providerVoiceListInFlight.delete(requestKey)
    })
  }

  async function loadProviderModel(
    providerId: string,
    config: Record<string, unknown>,
  ) {
    const definition = getProviderDefinition(providerId)
    const loadModel = definition.extraMethods?.loadModel
    if (!loadModel)
      return

    const provider = await definition.createProvider(config)
    try {
      await loadModel(config, provider)
    }
    finally {
      await disposeTemporaryProvider(provider)
    }
  }

  async function waitForLatestModelListResult(providerId: string): Promise<ModelInfo[]> {
    const latestRequest = latestModelListRequests.get(providerId)
    if (latestRequest)
      return cloneModelSnapshot(await latestRequest)

    return cloneReadyModelSnapshot(providerRuntimeState.value[providerId])
  }

  async function runModelListRequest(providerId: string): Promise<ModelInfo[]> {
    const definition = findProviderDefinition(providerId)
    if (!definition)
      return []

    const config = providerCredentials.value[providerId]
    if (!config && definition.requiresCredentials !== false)
      return []

    const requestId = ++nextModelListRequestId
    latestModelListRequestIds.set(providerId, requestId)
    initializeProviderRuntimeState(providerId)
    providerRuntimeState.value = {
      ...providerRuntimeState.value,
      [providerId]: {
        ...providerRuntimeState.value[providerId],
        modelStatus: 'loading',
        modelError: null,
      },
    }

    try {
      const models = await listProviderModels(providerId, config || {})
      const normalizedModels = uniqBy(models.filter(model => !!model.id), m => m.id)
        .map(model => ({
          id: model.id,
          name: model.name,
          description: model.description,
          contextLength: model.contextLength,
          deprecated: model.deprecated,
          provider: providerId,
        }))

      if (latestModelListRequestIds.get(providerId) !== requestId) {
        // Share the current owner's result so callers never consume an old
        // cache or miss a fallback selected from the fresh response.
        return waitForLatestModelListResult(providerId)
      }

      // Transform and store the models
      // A synced snapshot can replace this provider entry while the request is
      // pending. Read the current entry after await instead of updating the
      // detached object that entered the request.
      const currentRuntimeState = providerRuntimeState.value[providerId]
      if (currentRuntimeState) {
        providerRuntimeState.value = {
          ...providerRuntimeState.value,
          [providerId]: {
            ...currentRuntimeState,
            models: normalizedModels,
            modelStatus: 'ready',
            modelError: null,
          },
        }
        // Synced action results pass through structuredClone. Return the local
        // array because reading the same array from state returns a Vue proxy.
        return normalizedModels
      }
      return []
    }
    catch (error) {
      console.error(`Error fetching models for ${providerId}:`, error)
      const currentRuntimeState = providerRuntimeState.value[providerId]
      if (latestModelListRequestIds.get(providerId) === requestId && currentRuntimeState) {
        providerRuntimeState.value = {
          ...providerRuntimeState.value,
          [providerId]: {
            ...currentRuntimeState,
            modelStatus: 'error',
            modelError: errorMessageFrom(error) ?? 'Unknown error',
          },
        }
      }
      // Share the current owner's result even when this stale request rejects.
      if (latestModelListRequestIds.get(providerId) !== requestId)
        return waitForLatestModelListResult(providerId)

      return []
    }
  }

  // Function to fetch models for a specific provider
  function fetchModelsForProvider(providerId: string): Promise<ModelInfo[]> {
    const request = runModelListRequest(providerId)
    latestModelListRequests.set(providerId, request)

    return request.finally(() => {
      if (latestModelListRequests.get(providerId) === request)
        latestModelListRequests.delete(providerId)
    })
  }

  // Get models for a specific provider
  function getModelsForProvider(providerId: string) {
    return providerRuntimeState.value[providerId]?.models ?? emptyProviderModels
  }

  // Load models for all configured providers
  async function loadModelsForConfiguredProviders() {
    for (const providerId of availableProviders.value) {
      if (supportsModelListing(providerId)) {
        await fetchModelsForProvider(providerId)
      }
    }
  }
  const previousCredentialHashes = new Map<string, string>()

  async function refreshModelsForChangedCredentials() {
    const changedProviders: string[] = []

    for (const [providerId, currentConfig] of Object.entries(providerCredentials.value)) {
      const currentHash = modelCatalogCredentialHash(getProviderDefinitionId(providerId), currentConfig)
      const previousHash = previousCredentialHashes.get(providerId)

      if (currentHash !== previousHash) {
        changedProviders.push(providerId)
        previousCredentialHashes.set(providerId, currentHash)
      }
    }

    for (const providerId of changedProviders) {
      // Since credentials changed, dispose the cached instance so new creds take effect.
      await disposeProviderInstance(providerId)

      // If the provider is configured and has the capability, refetch its models
      if (providerConfigStore.providers[providerId]?.status === 'configured' && supportsModelListing(providerId)) {
        await fetchModelsForProvider(providerId)
      }
    }
  }

  function projectProvider(providerId: string): ProviderMetadata | undefined {
    const configuredProvider = providerConfigStore.providers[providerId]
    const metadata = providerMetadata[providerId]
      ?? providerMetadata[configuredProvider?.definitionId ?? '']

    if (!metadata)
      return undefined

    return {
      ...metadata,
      id: providerId,
      localizedName: metadata.nameKey === metadata.name
        ? metadata.name
        : t(metadata.nameKey, metadata.name),
      localizedDescription: metadata.descriptionKey === metadata.description
        ? metadata.description
        : t(metadata.descriptionKey, metadata.description),
      configured: configuredProvider?.status === 'configured',
    }
  }

  // Get all provider metadata in registry order for the settings page.
  const allProvidersMetadata = computed(() => {
    const definitions = definedProviders
      .filter(d => providerMetadata[d.id])
      .map(d => projectProvider(d.id))
      .filter(metadata => metadata !== undefined)

    const configuredInstances: ProviderMetadata[] = []
    for (const providerId of Object.keys(providerConfigStore.providers)) {
      if (providerMetadata[providerId])
        continue

      const metadata = projectProvider(providerId)
      if (metadata)
        configuredInstances.push(metadata)
    }

    return [...definitions, ...configuredInstances]
  })

  function getTranscriptionFeatures(providerId: string) {
    const features = findProviderDefinition(providerId)?.capabilities?.transcription

    return {
      supportsGenerate: features?.generateOutput ?? true,
      supportsStreamOutput: features?.streamOutput ?? false,
      supportsStreamInput: features?.streamInput ?? false,
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
    const cached = providerInstanceCache.get(providerId) as R | undefined
    if (cached)
      return cached

    const definition = getProviderDefinition(providerId)

    // Providers that don't require credentials use empty config
    let config = providerCredentials.value[providerId]
    const noCredentials = definition.requiresCredentials === false || providerId === 'browser-web-speech-api'
    if (!config && noCredentials) {
      config = getDefaultProviderConfig(providerId) || {}
      const definitionId = getProviderDefinitionId(providerId)
      providerConfigStore.ensureProvider(providerId, definitionId, config)
    }

    if (!config && !noCredentials)
      throw new Error(`Provider credentials for ${providerId} not found`)

    try {
      const instance = await definition.createProvider(config || {}) as R
      providerInstanceCache.set(providerId, instance)
      return instance
    }
    catch (error) {
      console.error(`Error creating provider instance for ${providerId}:`, error)
      throw error
    }
  }

  async function disposeProviderInstance(providerId: string) {
    const instance = providerInstanceCache.get(providerId) as { dispose?: () => Promise<void> | void } | undefined
    if (instance?.dispose)
      await instance.dispose()

    providerInstanceCache.delete(providerId)
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

      const definition = getProviderDefinition(provider.id)
      if (isCustomProvidersDisabled() && definition.requiresCredentials !== false)
        continue

      const isAvailableBy = definition.isAvailableBy || (() => true)

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
    return allChatProvidersMetadata.value.filter(metadata => providerConfigStore.configuredProviders[metadata.id])
  })

  const configuredSpeechProvidersMetadata = computed(() => {
    return allAudioSpeechProvidersMetadata.value.filter(metadata => providerConfigStore.configuredProviders[metadata.id])
  })

  const configuredTranscriptionProvidersMetadata = computed(() => {
    return allAudioTranscriptionProvidersMetadata.value.filter(metadata => providerConfigStore.configuredProviders[metadata.id])
  })

  const configuredVisionProvidersMetadata = computed(() => {
    return allVisionProvidersMetadata.value.filter(metadata => providerConfigStore.configuredProviders[metadata.id])
  })

  function isProviderConfigDirty(providerId: string) {
    const config = providerCredentials.value[providerId]
    if (!config)
      return false

    const defaultOptions = getDefaultProviderConfig(providerId)
    return JSON.stringify(normalizeProviderConfigDefaults(config, defaultOptions)) !== JSON.stringify(defaultOptions)
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

  const persistedVisionProvidersMetadata = computed(() => {
    return persistedProvidersMetadata.value.filter(metadata => metadata.category === 'vision')
  })

  return {
    deleteProvider,
    providerRuntimeState,
    providerAvailabilityOverrides,
    getProviderDefinition,
    findProviderDefinition,
    getDefaultProviderConfig,
    validateProviderConfig,
    hasManualProviderValidators,
    supportsModelListing,
    getTranscriptionFeatures,
    initializeProvider,
    validateProvider,
    refreshListedProviderValidation,
    refreshModelsForChangedCredentials,
    isLoadingModels,
    modelLoadError,
    fetchModelsForProvider,
    getModelsForProvider,
    listProviderVoices,
    loadProviderModel,
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
    persistedChatProvidersMetadata,
    persistedVisionProvidersMetadata,
  }
}, {
  synced: {
    actions: [
      'deleteProvider',
      'disposeProviderInstance',
      'fetchModelsForProvider',
      'forceProviderConfigured',
      'initializeProvider',
      'listProviderVoices',
      'loadModelsForConfiguredProviders',
      'loadProviderModel',
      'refreshListedProviderValidation',
      'refreshModelsForChangedCredentials',
      'resetProviderSettings',
      'setProviderAvailabilityOverride',
      'setProviderUnconfigured',
      'validateProvider',
      'validateProviderConfig',
    ],
    state: false,
  },
})
