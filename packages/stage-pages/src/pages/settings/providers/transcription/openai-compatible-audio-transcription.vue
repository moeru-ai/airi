<script setup lang="ts">
import type { RemovableRef } from '@vueuse/core'
import type { TranscriptionProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import {
  Alert,
  TranscriptionPlayground,
  TranscriptionProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useProviderValidation } from '@proj-airi/stage-ui/composables/use-provider-validation'
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { FieldInput, FieldSelect } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, watch } from 'vue'

const providerId = 'openai-compatible-audio-transcription'
const hearingStore = useHearingStore()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore) as { providers: RemovableRef<Record<string, any>> }

// Note: apiKey and baseUrl are managed by TranscriptionProviderSettings wrapper

const model = computed({
  get: () => providers.value[providerId]?.model || '',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].model = value
  },
})

// Load models
const providerModels = computed(() => {
  return providersStore.getModelsForProvider(providerId)
})

const isLoadingModels = computed(() => {
  return providersStore.isLoadingModels[providerId] || false
})

// Check if API key is configured (required for transcription to work)
const apiKeyConfigured = computed(() => {
  const config = providers.value[providerId]
  const apiKey = config?.apiKey as string | undefined
  const baseUrl = config?.baseUrl as string | undefined
  return !!(apiKey && apiKey.trim()) && !!(baseUrl && baseUrl.trim())
})

// Generate transcription
async function handleGenerateTranscription(file: File) {
  const provider = await providersStore.getProviderInstance<TranscriptionProviderWithExtraOptions<string, any>>(providerId)
  if (!provider)
    throw new Error('Failed to initialize transcription provider')

  // Get provider configuration
  const providerConfig = providersStore.getProviderConfig(providerId)

  // Get model from configuration or use the reactive model value
  const modelToUse = providerConfig.model as string | undefined || model.value

  // Validate model - throw error if no valid model configured
  if (!modelToUse || !isValidTranscriptionModel(modelToUse)) {
    throw new Error(`Invalid or missing transcription model. Please configure a valid model in the provider settings.`)
  }

  return await hearingStore.transcription(
    providerId,
    provider,
    modelToUse,
    file,
    'json',
  )
}

// Use the composable to get validation logic and state
const {
  t,
  providerMetadata,
  isValidating,
  isValid,
  validationMessage,
  forceValid,
} = useProviderValidation(providerId)

// Valid transcription models (OpenAI doesn't provide an API to list these)
const VALID_TRANSCRIPTION_MODELS = [
  'whisper-1',
  'gpt-4o-transcribe',
  'gpt-4o-mini-transcribe',
  'gpt-4o-mini-transcribe-2025-12-15',
  'gpt-4o-transcribe-diarize',
]

// Check if a model is a valid transcription model
function isValidTranscriptionModel(modelName: string | undefined | null): boolean {
  if (!modelName)
    return false
  // Check if it's a known transcription model
  if (VALID_TRANSCRIPTION_MODELS.includes(modelName))
    return true
  // Allow custom models that might be transcription-compatible
  // But reject obvious chat models
  if (modelName.includes('gpt-4') && !modelName.includes('transcribe') && !modelName.includes('whisper'))
    return false
  return true
}

// Initialize provider settings on mount
onMounted(async () => {
  providersStore.initializeProvider(providerId)
  // Validate and reset model if it's invalid (e.g., a chat model)
  const currentModel = model.value
  if (currentModel && !isValidTranscriptionModel(currentModel)) {
    console.warn(`Invalid transcription model "${currentModel}" detected. Resetting to default "whisper-1".`)
    model.value = 'whisper-1'
  }
  // Load models if API key and base URL are configured
  const providerConfig = providersStore.getProviderConfig(providerId)
  const apiKey = providerConfig?.apiKey as string | undefined
  const baseUrl = providerConfig?.baseUrl as string | undefined
  if (apiKey && baseUrl) {
    await providersStore.loadModelsForConfiguredProviders()
    await providersStore.fetchModelsForProvider(providerId)
  }
})

// Watch for provider config changes to reload models
watch(() => providers.value[providerId], async (newConfig) => {
  const apiKey = newConfig?.apiKey as string | undefined
  const baseUrl = newConfig?.baseUrl as string | undefined
  if (apiKey && baseUrl) {
    await providersStore.fetchModelsForProvider(providerId)
  }
}, { deep: true })

// Watch model changes to save to provider config
watch(model, () => {
  const providerConfig = providersStore.getProviderConfig(providerId)
  providerConfig.model = model.value
})
</script>

<template>
  <TranscriptionProviderSettings
    :provider-id="providerId"
  >
    <template #basic-settings>
      <!-- Model selection: Use dropdown if models are available, otherwise use text input -->
      <FieldSelect
        v-if="providerModels.length > 0"
        v-model="model"
        label="Model"
        description="Select the transcription model to use"
        :options="providerModels.map(m => ({ value: m.id, label: m.name }))"
        :disabled="isLoadingModels"
        placeholder="Select a model..."
      />
      <FieldInput
        v-else
        v-model="model"
        :label="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.manual_model_name')"
        :description="apiKeyConfigured ? 'Enter model name manually, or wait for models to load...' : 'Enter the transcription model name (e.g., whisper-1)'"
        :placeholder="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.manual_model_placeholder')"
      />
    </template>

    <template #advanced-settings>
      <!-- Validation Status -->
      <Alert v-if="!isValid && isValidating === 0 && validationMessage" type="error" class="mt-4">
        <template #title>
          <div class="w-full flex items-center justify-between">
            <span>{{ t('settings.dialogs.onboarding.validationFailed') }}</span>
            <button
              type="button"
              class="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs text-red-600 font-medium transition-colors dark:bg-red-800/30 hover:bg-red-200 dark:text-red-300 dark:hover:bg-red-700/40"
              @click="forceValid"
            >
              {{ t('settings.pages.providers.common.continueAnyway') }}
            </button>
          </div>
        </template>
        <template v-if="validationMessage" #content>
          <div class="whitespace-pre-wrap break-all">
            {{ validationMessage }}
          </div>
        </template>
      </Alert>
      <Alert v-if="isValid && isValidating === 0" type="success" class="mt-4">
        <template #title>
          {{ t('settings.dialogs.onboarding.validationSuccess') }}
        </template>
      </Alert>
    </template>

    <template #playground>
      <TranscriptionPlayground
        :generate-transcription="handleGenerateTranscription"
        :api-key-configured="apiKeyConfigured"
      />
    </template>
  </TranscriptionProviderSettings>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
