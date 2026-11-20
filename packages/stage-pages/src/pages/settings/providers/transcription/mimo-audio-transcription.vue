<script setup lang="ts">
import type { TranscriptionProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import { MIMO_ASR_LANGUAGES, MIMO_ASR_MODEL } from '@proj-airi/provider-inference'
import {
  ProviderAdvancedSettings,
  ProviderApiKeyInput,
  ProviderBaseUrlInput,
  ProviderBasicSettings,
  ProviderSettingsContainer,
  ProviderSettingsLayout,
  TranscriptionPlayground,
} from '@proj-airi/stage-ui/components'
import { useProviderValidation } from '@proj-airi/stage-ui/composables/use-provider-validation'
import { prepareMimoAsrUpload } from '@proj-airi/stage-ui/libs/audio/mimo-asr-upload'
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { Alert, Button, FieldCombobox } from '@proj-airi/ui'
import { computed, onMounted } from 'vue'

const providerId = 'mimo-audio-transcription'
const hearingStore = useHearingStore()
const providersStore = useProviderStore()
const providerStore = useProviderConfigStore()
const config = computed(() => providerStore.getProviderConfig(providerId))
const apiKey = computed(() => typeof config.value?.apiKey === 'string' ? config.value.apiKey : '')
const baseUrl = computed(() => typeof config.value?.baseUrl === 'string' ? config.value.baseUrl : '')
const model = MIMO_ASR_MODEL
const language = computed(() => MIMO_ASR_LANGUAGES.find(value => value === config.value?.language) ?? 'auto')
const apiKeyConfigured = computed(() => !!apiKey.value)
const providerModels = computed(() => providersStore.getModelsForProvider(providerId))
const isLoadingModels = computed(() => providersStore.isLoadingModels[providerId] || false)

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

const languageOptions = computed(() => [
  { value: 'auto', label: t('settings.pages.providers.provider.mimo.transcription.language.options.auto') },
  { value: 'zh', label: t('settings.pages.providers.provider.mimo.transcription.language.options.zh') },
  { value: 'en', label: t('settings.pages.providers.provider.mimo.transcription.language.options.en') },
])

onMounted(async () => {
  await providersStore.initializeProvider(providerId)
  await providerStore.patchProviderConfig(providerId, { model, language: language.value })
  await providersStore.loadModelsForConfiguredProviders()
  await providersStore.fetchModelsForProvider(providerId)
})

/** Field updates reach the provider owner through patchProviderConfig, including edits from follower windows. */
async function setField(key: 'apiKey' | 'baseUrl' | 'language', value: string | undefined) {
  if (value === undefined)
    return
  await providerStore.patchProviderConfig(providerId, { [key]: value })
}

/** TranscriptionPlayground uploads pass browser-decoded audio to Hearing and the portable MiMo request adapter. */
async function handleGenerateTranscription(file: File) {
  const provider = await providersStore.getProviderInstance<TranscriptionProviderWithExtraOptions<string, Record<string, unknown>>>(providerId)
  if (!provider)
    throw new Error('Failed to initialize transcription provider')
  const upload = await prepareMimoAsrUpload(file)
  return hearingStore.transcription(providerId, provider, model, upload, 'json', { providerOptions: { language: language.value } })
}
</script>

<template>
  <ProviderSettingsLayout
    :provider-name="providerMetadata?.localizedName"
    :provider-icon-color="providerMetadata?.iconColor"
    :on-back="() => router.back()"
  >
    <ProviderSettingsContainer>
      <ProviderBasicSettings
        :title="t('settings.pages.providers.common.section.basic.title')"
        :description="t('settings.pages.providers.common.section.basic.description')"
        :on-reset="handleResetSettings"
      >
        <ProviderApiKeyInput
          :model-value="apiKey"
          :provider-name="providerMetadata?.localizedName"
          placeholder="mimo_... (MiMo API key)"
          @update:model-value="setField('apiKey', $event)"
        />
        <FieldCombobox
          :model-value="model"
          :label="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.manual_model_name')"
          :options="providerModels.map(m => ({ value: m.id, label: m.name }))"
          :disabled="isLoadingModels || providerModels.length === 0"
          placeholder="Select a model..."
        />
        <FieldCombobox
          :model-value="language"
          :label="t('settings.pages.providers.provider.mimo.transcription.language.label')"
          :description="t('settings.pages.providers.provider.mimo.transcription.language.description')"
          :options="languageOptions"
          @update:model-value="setField('language', $event)"
        />
      </ProviderBasicSettings>

      <ProviderAdvancedSettings :title="t('settings.pages.providers.common.section.advanced.title')">
        <ProviderBaseUrlInput
          :model-value="baseUrl"
          :placeholder="providerMetadata?.defaultConfig.baseUrl as string || 'https://api.xiaomimimo.com/v1/'"
          @update:model-value="setField('baseUrl', $event)"
        />
      </ProviderAdvancedSettings>

      <Alert v-if="!isValid && isValidating === 0 && validationMessage" tone="danger" :title="t('settings.dialogs.onboarding.validationFailed')">
        <div :class="['whitespace-pre-wrap break-all']">
          {{ validationMessage }}
        </div>
        <template #actions>
          <Button size="sm" color="red" @click="forceValid">
            {{ t('settings.pages.providers.common.continueAnyway') }}
          </Button>
        </template>
      </Alert>
      <Alert
        v-if="isValid && isValidating === 0" tone="success"
        :title="t('settings.pages.providers.provider.mimo.transcription.validation.local-complete')"
      >
        {{ t('settings.pages.providers.provider.mimo.transcription.validation.local-complete-description') }}
      </Alert>
    </ProviderSettingsContainer>

    <TranscriptionPlayground
      :generate-transcription="handleGenerateTranscription"
      :api-key-configured="apiKeyConfigured"
    />
  </ProviderSettingsLayout>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
