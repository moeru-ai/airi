<script setup lang="ts">
import type { RemovableRef } from '@vueuse/core'
import type { TranscriptionProvider } from '@xsai-ext/shared-providers'

import {
  ProviderAdvancedSettings,
  ProviderApiKeyInput,
  ProviderBaseUrlInput,
  ProviderBasicSettings,
  ProviderSettingsContainer,
  ProviderSettingsLayout,
  TranscriptionPlayground,
} from '@proj-airi/stage-ui/components'
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { FieldInput } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const hearingStore = useHearingStore()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore) as { providers: RemovableRef<Record<string, any>> }
const { t } = useI18n()
const router = useRouter()

// Get provider metadata
const providerId = 'openai-compatible-audio-transcription'
const providerMetadata = computed(() => providersStore.getProviderMetadata(providerId))
const pageTitle = computed(() => providerMetadata.value?.localizedName || t('settings.pages.providers.provider.openai-compatible-audio-transcription.title'))

// Settings refs
const apiKey = computed({
  get: () => providers.value[providerId]?.apiKey || '',
  set: value => (providers.value[providerId] = { ...providers.value[providerId], apiKey: value }),
})

const baseUrl = computed({
  get: () => providers.value[providerId]?.baseUrl || '',
  set: value => (providers.value[providerId] = { ...providers.value[providerId], baseUrl: value }),
})

const model = computed({
  get: () => providers.value[providerId]?.model || 'whisper-1',
  set: value => (providers.value[providerId] = { ...providers.value[providerId], model: value }),
})

// Check if API key is configured
const apiKeyConfigured = computed(() => !!providers.value[providerId]?.apiKey)

// Generate transcription
async function handleGenerateTranscription(file: File) {
  const provider = await providersStore.getProviderInstance<TranscriptionProvider<string>>(providerId)
  if (!provider)
    throw new Error('Failed to initialize transcription provider')

  return await hearingStore.transcription(
    provider,
    model.value,
    file,
    'json',
  )
}

onMounted(() => {
  providersStore.initializeProvider(providerId)
  const config = providers.value[providerId] || {}
  apiKey.value = config.apiKey || ''
  baseUrl.value = config.baseUrl || ''
  model.value = config.model || 'whisper-1'
})

function handleResetSettings() {
  const defaults = providerMetadata.value?.defaultOptions?.() || {}
  providers.value[providerId] = {
    apiKey: '',
    baseUrl: defaults.baseUrl || '',
    model: 'whisper-1',
  }
  // Force update refs
  apiKey.value = ''
  baseUrl.value = defaults.baseUrl || ''
  model.value = 'whisper-1'
}
</script>

<template>
  <ProviderSettingsLayout
    :provider-name="pageTitle"
    :provider-icon="providerMetadata?.icon"
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
          placeholder="sk-..."
        />
        <FieldInput
          v-model="model"
          :label="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.manual_model_name')"
          :placeholder="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.manual_model_placeholder')"
        />
      </ProviderBasicSettings>

      <ProviderAdvancedSettings :title="t('settings.pages.providers.common.section.advanced.title')">
        <ProviderBaseUrlInput
          v-model="baseUrl"
          placeholder="https://api.example.com/v1/"
        />
      </ProviderAdvancedSettings>
    </ProviderSettingsContainer>

    <template #playground>
      <TranscriptionPlayground
        :generate-transcription="handleGenerateTranscription"
        :api-key-configured="apiKeyConfigured"
      />
    </template>
  </ProviderSettingsLayout>
</template>

<route lang="yaml">
  meta:
    layout: settings
    stageTransition:
      name: slide
  </route>
