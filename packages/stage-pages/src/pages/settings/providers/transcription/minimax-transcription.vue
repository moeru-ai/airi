<script setup lang="ts">
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
import { FieldInput } from '@proj-airi/ui'
import { computed } from 'vue'

const providerId = 'minimax-transcription'
const defaultModel = 'asr-1.0'

const hearingStore = useHearingStore()
const providersStore = useProviderStore()
const providerStore = useProviderConfigStore()
const config = computed<Record<string, unknown> | undefined>(() => providerStore.getProviderConfig(providerId))

async function updateConfig(field: 'apiKey' | 'baseUrl' | 'language', value: string) {
  await providersStore.initializeProvider(providerId)
  await providerStore.patchProviderConfig(providerId, { [field]: value })
}

const apiKey = computed({
  get: () => typeof config.value?.apiKey === 'string' ? config.value.apiKey : '',
  set: async (value: string) => { await updateConfig('apiKey', value) },
})

const baseUrl = computed({
  get: () => typeof config.value?.baseUrl === 'string' ? config.value.baseUrl : '',
  set: async (value: string) => { await updateConfig('baseUrl', value) },
})

// An empty language lets the API recognize mixed languages.
const language = computed({
  get: () => typeof config.value?.language === 'string' ? config.value.language : '',
  set: async (value: string) => { await updateConfig('language', value) },
})

const model = computed({
  get: () => typeof config.value?.model === 'string' && config.value.model ? config.value.model : defaultModel,
  set: async (value: string) => {
    await providersStore.initializeProvider(providerId)
    await providerStore.setProviderModel(providerId, value)
  },
})

const apiKeyConfigured = computed(() => Boolean(apiKey.value))

async function handleGenerateTranscription(file: File) {
  const provider = await providersStore.getProviderInstance<TranscriptionProviderWithExtraOptions<string, Record<string, unknown>>>(providerId)
  if (!provider)
    throw new Error('Failed to initialize transcription provider')

  return await hearingStore.transcription(providerId, provider, model.value, file, 'json')
}

const {
  t,
  router,
  providerMetadata,
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
      >
        <ProviderApiKeyInput v-model="apiKey" :provider-name="providerMetadata?.localizedName" />
        <FieldInput
          v-model="model"
          :label="t('settings.pages.providers.provider.minimax-transcription.fields.field.model.label')"
          :description="t('settings.pages.providers.provider.minimax-transcription.fields.field.model.description')"
          :placeholder="defaultModel"
        />
        <FieldInput
          v-model="language"
          :label="t('settings.pages.providers.provider.minimax-transcription.fields.field.language.label')"
          :description="t('settings.pages.providers.provider.minimax-transcription.fields.field.language.description')"
          :placeholder="t('settings.pages.providers.provider.minimax-transcription.fields.field.language.placeholder')"
        />
      </ProviderBasicSettings>

      <ProviderAdvancedSettings :title="t('settings.pages.providers.common.section.advanced.title')">
        <ProviderBaseUrlInput v-model="baseUrl" placeholder="https://api.minimax.io/v1/" />
      </ProviderAdvancedSettings>
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
