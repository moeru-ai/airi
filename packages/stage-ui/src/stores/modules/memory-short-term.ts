import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { refManualReset } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed } from 'vue'

import {
  defaultPlannerLlmSystemPrompt,
  normalizePlannerSystemPrompt,
} from '../chat/alaya/planner-system-prompt'
import { usePlannerEmbeddingProvidersStore } from '../planner-embedding-providers'
import { usePlannerProvidersStore } from '../planner-providers'

const legacyPlannerSystemPromptStorageKey = 'settings/memory-short-term/planner-system-prompt'
const plannerSystemPromptStorageKey = 'settings/memory-short-term/planner-system-prompt-active'

function clearLegacyPlannerSystemPromptStorage() {
  if (typeof window === 'undefined')
    return

  try {
    window.localStorage.removeItem(legacyPlannerSystemPromptStorageKey)
  }
  catch {
    // Ignore localStorage cleanup failures in non-browser or privacy-restricted contexts.
  }
}

export const useMemoryShortTermStore = defineStore('memory-short-term', () => {
  const plannerProvidersStore = usePlannerProvidersStore()
  const plannerEmbeddingProvidersStore = usePlannerEmbeddingProvidersStore()

  clearLegacyPlannerSystemPromptStorage()

  const defaultPlannerRoundThreshold = 5
  const defaultPlannerTimeoutMs = 10_000
  const defaultEmbeddingTimeoutMs = 20_000
  const defaultEmbeddingBatchSize = 12
  const plannerProvider = useLocalStorageManualReset<string>('settings/memory-short-term/planner-provider', '')
  const plannerModel = useLocalStorageManualReset<string>('settings/memory-short-term/planner-model', '')
  const plannerCustomModelName = useLocalStorageManualReset<string>('settings/memory-short-term/planner-custom-model', '')
  const plannerRoundThreshold = useLocalStorageManualReset<number>('settings/memory-short-term/planner-round-threshold', defaultPlannerRoundThreshold)
  const plannerTimeoutMs = useLocalStorageManualReset<number>('settings/memory-short-term/planner-timeout-ms', defaultPlannerTimeoutMs)
  const plannerSystemPrompt = useLocalStorageManualReset<string>(plannerSystemPromptStorageKey, defaultPlannerLlmSystemPrompt)
  const embeddingEnabled = useLocalStorageManualReset<boolean>('settings/memory-short-term/embedding-enabled', true)
  const embeddingProvider = useLocalStorageManualReset<string>('settings/memory-short-term/embedding-provider', '')
  const embeddingModel = useLocalStorageManualReset<string>('settings/memory-short-term/embedding-model', '')
  const embeddingCustomModelName = useLocalStorageManualReset<string>('settings/memory-short-term/embedding-custom-model', '')
  const embeddingTimeoutMs = useLocalStorageManualReset<number>('settings/memory-short-term/embedding-timeout-ms', defaultEmbeddingTimeoutMs)
  const embeddingBatchSize = useLocalStorageManualReset<number>('settings/memory-short-term/embedding-batch-size', defaultEmbeddingBatchSize)
  const modelSearchQuery = refManualReset<string>('')
  const embeddingModelSearchQuery = refManualReset<string>('')

  const normalizedStoredPlannerPrompt = normalizePlannerSystemPrompt(plannerSystemPrompt.value)
  if (plannerSystemPrompt.value !== normalizedStoredPlannerPrompt)
    plannerSystemPrompt.value = normalizedStoredPlannerPrompt

  const supportsModelListing = computed(() => {
    return plannerProvidersStore.getProviderMetadata(plannerProvider.value)?.capabilities.listModels !== undefined
  })

  const providerModels = computed(() => {
    return plannerProvidersStore.getModelsForProvider(plannerProvider.value)
  })

  const isLoadingProviderModels = computed(() => {
    return plannerProvidersStore.plannerIsLoadingModels[plannerProvider.value] || false
  })

  const providerModelError = computed(() => {
    return plannerProvidersStore.plannerModelLoadError[plannerProvider.value] || null
  })

  const configured = computed(() => {
    return !!plannerProvider.value && !!plannerModel.value
  })

  const resolvedEmbeddingProvider = computed(() => embeddingProvider.value)
  const resolvedEmbeddingModel = computed(() => embeddingModel.value)

  const embeddingConfigured = computed(() => {
    return Boolean(
      embeddingEnabled.value
      && resolvedEmbeddingProvider.value
      && resolvedEmbeddingModel.value,
    )
  })

  const embeddingSupportsModelListing = computed(() => {
    if (!resolvedEmbeddingProvider.value)
      return false

    return plannerEmbeddingProvidersStore.getProviderMetadata(resolvedEmbeddingProvider.value)?.capabilities.listModels !== undefined
  })

  const embeddingProviderModels = computed(() => {
    return plannerEmbeddingProvidersStore.getModelsForProvider(resolvedEmbeddingProvider.value)
  })

  const isLoadingEmbeddingProviderModels = computed(() => {
    return plannerEmbeddingProvidersStore.embeddingIsLoadingModels[resolvedEmbeddingProvider.value] || false
  })

  const embeddingProviderModelError = computed(() => {
    return plannerEmbeddingProvidersStore.embeddingModelLoadError[resolvedEmbeddingProvider.value] || null
  })

  const normalizedPlannerRoundThreshold = computed(() => {
    const value = Number(plannerRoundThreshold.value)
    if (!Number.isFinite(value))
      return defaultPlannerRoundThreshold
    return Math.max(1, Math.floor(value))
  })

  const normalizedPlannerSystemPrompt = computed(() => {
    return normalizePlannerSystemPrompt(plannerSystemPrompt.value)
  })

  const normalizedPlannerTimeoutMs = computed(() => {
    const value = Number(plannerTimeoutMs.value)
    if (!Number.isFinite(value))
      return defaultPlannerTimeoutMs
    return Math.max(1000, Math.min(100_000, Math.floor(value)))
  })

  const normalizedEmbeddingTimeoutMs = computed(() => {
    const value = Number(embeddingTimeoutMs.value)
    if (!Number.isFinite(value))
      return defaultEmbeddingTimeoutMs
    return Math.max(1000, Math.min(120_000, Math.floor(value)))
  })

  const normalizedEmbeddingBatchSize = computed(() => {
    const value = Number(embeddingBatchSize.value)
    if (!Number.isFinite(value))
      return defaultEmbeddingBatchSize
    return Math.max(1, Math.min(64, Math.floor(value)))
  })

  function resetModelSelection() {
    plannerModel.reset()
    plannerCustomModelName.reset()
    modelSearchQuery.reset()
  }

  function resetEmbeddingModelSelection() {
    embeddingModel.reset()
    embeddingCustomModelName.reset()
    embeddingModelSearchQuery.reset()
  }

  async function loadModelsForProvider(provider: string) {
    if (!provider)
      return

    if (plannerProvidersStore.getProviderMetadata(provider)?.capabilities.listModels === undefined)
      return

    await plannerProvidersStore.fetchModelsForProvider(provider)
  }

  async function loadEmbeddingModelsForProvider(provider: string) {
    if (!provider)
      return

    if (plannerEmbeddingProvidersStore.getProviderMetadata(provider)?.capabilities.listModels === undefined)
      return

    await plannerEmbeddingProvidersStore.fetchModelsForProvider(provider)
  }

  function resetState() {
    plannerProvider.reset()
    resetModelSelection()
    plannerRoundThreshold.reset()
    plannerTimeoutMs.reset()
    plannerSystemPrompt.value = defaultPlannerLlmSystemPrompt
    embeddingEnabled.reset()
    embeddingProvider.reset()
    resetEmbeddingModelSelection()
    embeddingTimeoutMs.reset()
    embeddingBatchSize.reset()
  }

  function setPlannerRoundThreshold(value: number) {
    if (!Number.isFinite(value)) {
      plannerRoundThreshold.value = defaultPlannerRoundThreshold
      return
    }

    plannerRoundThreshold.value = Math.max(1, Math.floor(value))
  }

  function setPlannerSystemPrompt(value: string) {
    plannerSystemPrompt.value = value
  }

  function setPlannerTimeoutMs(value: number) {
    if (!Number.isFinite(value)) {
      plannerTimeoutMs.value = defaultPlannerTimeoutMs
      return
    }

    plannerTimeoutMs.value = Math.max(1000, Math.min(100_000, Math.floor(value)))
  }

  function resetPlannerSystemPrompt() {
    plannerSystemPrompt.value = defaultPlannerLlmSystemPrompt
  }

  function setEmbeddingEnabled(value: boolean) {
    embeddingEnabled.value = Boolean(value)
  }

  function setEmbeddingProvider(providerId: string) {
    if (embeddingProvider.value !== providerId) {
      embeddingProvider.value = providerId
      embeddingModel.value = ''
      embeddingCustomModelName.value = ''
      embeddingModelSearchQuery.reset()
    }
  }

  function setEmbeddingTimeoutMs(value: number) {
    if (!Number.isFinite(value)) {
      embeddingTimeoutMs.value = defaultEmbeddingTimeoutMs
      return
    }

    embeddingTimeoutMs.value = Math.max(1000, Math.min(120_000, Math.floor(value)))
  }

  function setEmbeddingBatchSize(value: number) {
    if (!Number.isFinite(value)) {
      embeddingBatchSize.value = defaultEmbeddingBatchSize
      return
    }

    embeddingBatchSize.value = Math.max(1, Math.min(64, Math.floor(value)))
  }

  return {
    configured,
    embeddingConfigured,
    plannerProvider,
    plannerModel,
    customModelName: plannerCustomModelName,
    embeddingEnabled,
    embeddingProvider,
    embeddingModel,
    embeddingCustomModelName,
    resolvedEmbeddingProvider,
    resolvedEmbeddingModel,
    embeddingTimeoutMs,
    embeddingBatchSize,
    plannerRoundThreshold,
    plannerTimeoutMs,
    normalizedPlannerRoundThreshold,
    plannerSystemPrompt,
    normalizedPlannerSystemPrompt,
    normalizedPlannerTimeoutMs,
    normalizedEmbeddingTimeoutMs,
    normalizedEmbeddingBatchSize,
    modelSearchQuery,
    embeddingModelSearchQuery,
    supportsModelListing,
    providerModels,
    isLoadingProviderModels,
    providerModelError,
    embeddingSupportsModelListing,
    embeddingProviderModels,
    isLoadingEmbeddingProviderModels,
    embeddingProviderModelError,
    resetModelSelection,
    resetEmbeddingModelSelection,
    loadModelsForProvider,
    loadEmbeddingModelsForProvider,
    setPlannerRoundThreshold,
    setPlannerSystemPrompt,
    setPlannerTimeoutMs,
    resetPlannerSystemPrompt,
    setEmbeddingEnabled,
    setEmbeddingProvider,
    setEmbeddingTimeoutMs,
    setEmbeddingBatchSize,
    resetState,
  }
})
