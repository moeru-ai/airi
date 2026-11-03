<script setup lang="ts">
import type { RemovableRef } from '@vueuse/core'
import type { TranscriptionProviderWithExtraOptions } from '@xsai-ext/providers/utils'

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
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { Alert, Button, FieldCombobox } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted } from 'vue'

const providerId = 'mimo-audio-transcription'
const hearingStore = useHearingStore()
const providersStore = useProviderStore()
const providerStore = useProviderConfigStore()
const { configs: providers } = storeToRefs(providerStore) as { configs: RemovableRef<Record<string, any>> }

const apiKey = computed({
  get: () => providers.value[providerId]?.apiKey || '',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].apiKey = value
  },
})

const baseUrl = computed({
  get: () => providers.value[providerId]?.baseUrl || '',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].baseUrl = value
  },
})

const model = computed({
  get: () => providers.value[providerId]?.model || 'mimo-v2-omni',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].model = value
  },
})

const apiKeyConfigured = computed(() => !!providers.value[providerId]?.apiKey)

const providerModels = computed(() => providersStore.getModelsForProvider(providerId))

const isLoadingModels = computed(() => providersStore.isLoadingModels[providerId] || false)

onMounted(async () => {
  await providersStore.loadModelsForConfiguredProviders()
  await providersStore.fetchModelsForProvider(providerId)
})

async function handleGenerateTranscription(file: File) {
  const provider = await providersStore.getProviderInstance<TranscriptionProviderWithExtraOptions<string, any>>(providerId)
  if (!provider)
    throw new Error('Failed to initialize transcription provider')

  return await hearingStore.transcription(
    providerId,
    provider,
    model.value,
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
          v-model="apiKey"
          :provider-name="providerMetadata?.localizedName"
          placeholder="mimo_... (MiMo API key)"
        />
        <FieldCombobox
          v-model="model"
          :label="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.manual_model_name')"
          :options="providerModels.map(m => ({ value: m.id, label: m.name }))"
          :disabled="isLoadingModels || providerModels.length === 0"
          placeholder="Select a model..."
        />
      </ProviderBasicSettings>

      <ProviderAdvancedSettings :title="t('settings.pages.providers.common.section.advanced.title')">
        <ProviderBaseUrlInput
          v-model="baseUrl"
          :placeholder="providerMetadata?.defaultConfig.baseUrl as string || 'https://api.xiaomimimo.com/v1/'"
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
      <Alert v-if="isValid && isValidating === 0" tone="success" :title="t('settings.dialogs.onboarding.validationSuccess')" />
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
