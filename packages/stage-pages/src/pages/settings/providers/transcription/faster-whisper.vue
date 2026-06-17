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
import { Callout, FieldCombobox, FieldInput } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, watch } from 'vue'

const providerId = 'faster-whisper'
const hearingStore = useHearingStore()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore) as { providers: RemovableRef<Record<string, any>> }

// API key is optional for a local faster-whisper server, but some deployments gate it.
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

const providerModels = computed(() => providersStore.getModelsForProvider(providerId))
const isLoadingModels = computed(() => providersStore.isLoadingModels[providerId] || false)

// The local server does not require an API key, so the playground is usable as
// soon as a reachable base URL is configured.
const apiKeyConfigured = computed(() => !!baseUrl.value)

async function handleGenerateTranscription(file: File) {
  const provider = await providersStore.getProviderInstance<TranscriptionProviderWithExtraOptions<string, any>>(providerId)
  if (!provider)
    throw new Error('Failed to initialize transcription provider')

  const providerConfig = providersStore.getProviderConfig(providerId)
  // Minimal servers ignore the model field, so fall back to a harmless default
  // rather than blocking when the server does not expose /v1/models.
  const modelToUse = (providerConfig.model as string | undefined) || model.value || 'whisper-1'

  return await hearingStore.transcription(
    providerId,
    provider,
    modelToUse,
    file,
    'json',
  )
}

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

// Expand Advanced section if the base URL failed validation.
const shouldExpandAdvanced = computed(() => {
  if (!validationMessage.value)
    return false
  const message = validationMessage.value.toLowerCase()
  return message.includes('base url') || message.includes('baseurl')
})

onMounted(async () => {
  providersStore.initializeProvider(providerId)
  if (!providers.value[providerId]?.baseUrl) {
    const metadata = providersStore.getProviderMetadata(providerId)
    const defaultBaseUrl = metadata?.defaultOptions?.().baseUrl as string | undefined
    if (defaultBaseUrl)
      baseUrl.value = defaultBaseUrl
  }
  // Models can be listed from /v1/models without an API key on a local server.
  if (baseUrl.value)
    await providersStore.fetchModelsForProvider(providerId)
})

watch([apiKey, baseUrl], async ([, newBaseUrl]) => {
  if (newBaseUrl)
    await providersStore.fetchModelsForProvider(providerId)
})

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
        <Callout
          theme="violet"
          :label="t('settings.pages.providers.provider.faster-whisper.callout_local_server_title')"
        >
          {{ t('settings.pages.providers.provider.faster-whisper.callout_local_server') }}
        </Callout>

        <ProviderBasicSettings
          :title="t('settings.pages.providers.common.section.basic.title')"
          :description="t('settings.pages.providers.common.section.basic.description')"
          :on-reset="handleResetSettings"
        >
          <!-- Model selection: dropdown when the server reports models, otherwise manual entry -->
          <FieldCombobox
            v-if="providerModels.length > 0"
            v-model="model"
            label="Model"
            description="Select a model loaded by your faster-whisper server"
            :options="providerModels.map(m => ({ value: m.id, label: m.name }))"
            :disabled="isLoadingModels"
            placeholder="Select a model..."
          />
          <FieldInput
            v-else
            v-model="model"
            :label="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.manual_model_name')"
            description="Enter a model id (e.g., Systran/faster-whisper-large-v3), or wait for models to load..."
            placeholder="Systran/faster-whisper-large-v3"
          />
        </ProviderBasicSettings>

        <ProviderAdvancedSettings
          :title="t('settings.pages.providers.common.section.advanced.title')"
          :initial-visible="shouldExpandAdvanced"
        >
          <ProviderBaseUrlInput
            v-model="baseUrl"
            placeholder="http://localhost:8000/v1/"
            required
          />
          <ProviderApiKeyInput
            v-model="apiKey"
            :provider-name="providerMetadata?.localizedName"
            placeholder="sk-... (optional for local servers)"
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
