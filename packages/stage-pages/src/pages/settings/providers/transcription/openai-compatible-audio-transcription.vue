<script setup lang="ts">
import type { RemovableRef } from '@vueuse/core'
import type { TranscriptionProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import {
  Alert,
  ProviderAdvancedSettings,
  ProviderApiKeyInput,
  ProviderBaseUrlInput,
  ProviderBasicSettings,
  ProviderSettingsContainer,
  ProviderSettingsLayout,
  TranscriptionPlayground,
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

// Define computed properties for credentials
const apiKey = computed({
  get: () => providers.value[providerId]?.apiKey || '',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].apiKey = value
  },
})

const baseUrl = computed({
  get: () => {
    const stored = providers.value[providerId]?.baseUrl
    if (stored)
      return stored
    // Use default from provider metadata if available
    const metadata = providersStore.getProviderMetadata(providerId)
    return metadata?.defaultOptions?.().baseUrl as string | undefined || ''
  },
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].baseUrl = value
  },
})

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

// Check if API key is configured
const apiKeyConfigured = computed(() => !!providers.value[providerId]?.apiKey)

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
  router,
  providerMetadata,
  isValidating,
  isValid,
  validationMessage,
  handleResetSettings,
  forceValid,
} = useProviderValidation(providerId)

// Expand Advanced section if there's a base URL validation error
const shouldExpandAdvanced = computed(() => {
  if (!validationMessage.value)
    return false
  // Check if validation message mentions base URL
  const message = validationMessage.value.toLowerCase()
  return message.includes('base url') || message.includes('baseurl')
})

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
  // Initialize baseUrl with default if not set
  if (!providers.value[providerId]?.baseUrl) {
    const metadata = providersStore.getProviderMetadata(providerId)
    const defaultBaseUrl = metadata?.defaultOptions?.().baseUrl as string | undefined
    if (defaultBaseUrl) {
      baseUrl.value = defaultBaseUrl
    }
  }
  // Validate and reset model if it's invalid (e.g., a chat model)
  const currentModel = model.value
  if (currentModel && !isValidTranscriptionModel(currentModel)) {
    console.warn(`Invalid transcription model "${currentModel}" detected. Resetting to default "whisper-1".`)
    model.value = 'whisper-1'
  }
  // Load models if API key and base URL are configured
  if (apiKey.value && baseUrl.value) {
    await providersStore.loadModelsForConfiguredProviders()
    await providersStore.fetchModelsForProvider(providerId)
  }
})

// Watch for API key and base URL changes to reload models
watch([apiKey, baseUrl], async ([newApiKey, newBaseUrl]) => {
  if (newApiKey && newBaseUrl) {
    await providersStore.fetchModelsForProvider(providerId)
  }
})

// Watch model changes to save to provider config
watch(model, () => {
  const providerConfig = providersStore.getProviderConfig(providerId)
  providerConfig.model = model.value
})
</script>

<template>
  <ProviderSettingsLayout
    :provider-name="providerMetadata?.localizedName"
    :provider-icon-color="providerMetadata?.iconColor"
    :on-back="() => router.back()"
  >
    <div flex="~ col md:row gap-6">
      <ProviderSettingsContainer class="w-full md:w-[40%]">
        <ProviderBasicSettings
          :title="t('settings.pages.providers.common.section.basic.title')"
          :description="t('settings.pages.providers.common.section.basic.description')"
          :on-reset="handleResetSettings"
        >
          <ProviderApiKeyInput
            v-model="apiKey"
            :provider-name="providerMetadata?.localizedName"
            placeholder="sk-..."
          />
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
            :description="apiKey && baseUrl ? 'Enter model name manually, or wait for models to load...' : 'Enter the transcription model name (e.g., whisper-1)'"
            :placeholder="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.manual_model_placeholder')"
          />
        </ProviderBasicSettings>

        <ProviderAdvancedSettings
          :title="t('settings.pages.providers.common.section.advanced.title')"
          :initial-visible="shouldExpandAdvanced"
        >
          <ProviderBaseUrlInput
            v-model="baseUrl"
            placeholder="https://api.openai.com/v1/"
            required
          />
        </ProviderAdvancedSettings>

        <!-- Validation Status -->
        <Alert v-if="!isValid && isValidating === 0 && validationMessage" type="error">
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
        <Alert v-if="isValid && isValidating === 0" type="success">
          <template #title>
            {{ t('settings.dialogs.onboarding.validationSuccess') }}
          </template>
        </Alert>
      </ProviderSettingsContainer>

      <!-- Playground section -->
      <div flex="~ col gap-6" class="w-full md:w-[60%]">
        <div w-full rounded-xl>
          <TranscriptionPlayground
            :generate-transcription="handleGenerateTranscription"
            :api-key-configured="apiKeyConfigured"
          />
        </div>
      </div>
    </div>
  </ProviderSettingsLayout>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
