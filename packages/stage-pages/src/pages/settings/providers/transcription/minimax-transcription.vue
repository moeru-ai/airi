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
import { FieldInput } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

const providerId = 'minimax-transcription'
const defaultModel = 'asr-1.0'

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

// An empty language lets the API recognise mixed languages.
const language = computed({
  get: () => providers.value[providerId]?.language || '',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].language = value
  },
})

const model = computed({
  get: () => providers.value[providerId]?.model || defaultModel,
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].model = value
  },
})

const apiKeyConfigured = computed(() => !!providers.value[providerId]?.apiKey)

async function handleGenerateTranscription(file: File) {
  const provider = await providersStore.getProviderInstance<TranscriptionProviderWithExtraOptions<string, any>>(providerId)
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
