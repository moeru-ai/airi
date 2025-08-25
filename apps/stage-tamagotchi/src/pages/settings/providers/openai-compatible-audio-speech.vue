<script setup lang="ts">
import type { RemovableRef } from '@vueuse/core'
import type { SpeechProvider } from '@xsai-ext/shared-providers'

import {
  ProviderAdvancedSettings,
  ProviderApiKeyInput,
  ProviderBaseUrlInput,
  ProviderBasicSettings,
  ProviderSettingsContainer,
  ProviderSettingsLayout,
  SpeechPlaygroundOpenAICompatible,
} from '@proj-airi/stage-ui/components'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { FieldRange } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const speechStore = useSpeechStore()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore) as { providers: RemovableRef<Record<string, any>> }
const { t } = useI18n()
const router = useRouter()

const defaultVoiceSettings = {
  speed: 1.0,
}

// Get provider metadata
const providerId = 'openai-compatible-audio-speech'
const providerMetadata = computed(() => providersStore.getProviderMetadata(providerId))

// Settings refs
const apiKey = computed({
  get: () => providers.value[providerId]?.apiKey || '',
  set: (value) => {
    if (providers.value[providerId])
      providers.value[providerId].apiKey = value
  },
})

const baseUrl = computed({
  get: () => providers.value[providerId]?.baseUrl || '',
  set: (value) => {
    if (providers.value[providerId])
      providers.value[providerId].baseUrl = value
  },
})

const model = computed({
  get: () => providers.value[providerId]?.model || 'tts-1',
  set: (value) => {
    if (providers.value[providerId])
      providers.value[providerId].model = value
  },
})

const voice = computed({
  get: () => providers.value[providerId]?.voice || 'alloy',
  set: (value) => {
    if (providers.value[providerId])
      providers.value[providerId].voice = value
  },
})

const speed = ref<number>(1.0)

// Check if API key is configured
const apiKeyConfigured = computed(() => !!providers.value[providerId]?.apiKey)

// Generate speech with specific parameters
async function handleGenerateSpeech(input: string, voiceId: string, _useSSML: boolean, modelId?: string) {
  const provider = await providersStore.getProviderInstance<SpeechProvider<string>>(providerId)
  if (!provider)
    throw new Error('Failed to initialize speech provider')

  const providerConfig = providersStore.getProviderConfig(providerId)

  return await speechStore.speech(
    provider,
    modelId || model.value,
    input,
    voiceId || voice.value,
    {
      ...providerConfig,
      ...defaultVoiceSettings,
      speed: speed.value,
    },
  )
}

onMounted(() => {
  providersStore.initializeProvider(providerId)
  const config = providers.value[providerId] || {}
  apiKey.value = config.apiKey || ''
  baseUrl.value = config.baseUrl || ''
  model.value = config.model || 'tts-1'
  voice.value = config.voice || 'alloy'
  speed.value = config.speed || 1.0
})

watch(speed, (newSpeed) => {
  if (providers.value[providerId])
    providers.value[providerId].speed = newSpeed
})

function handleResetSettings() {
  const defaults = providerMetadata.value?.defaultOptions?.() || {}
  providers.value[providerId] = {
    apiKey: '',
    baseUrl: defaults.baseUrl || '',
    model: 'tts-1',
    voice: 'alloy',
    speed: 1.0,
  }
  // Force update refs
  apiKey.value = ''
  baseUrl.value = defaults.baseUrl || ''
  model.value = 'tts-1'
  voice.value = 'alloy'
  speed.value = 1.0
}
</script>

<template>
  <ProviderSettingsLayout
    :provider-name="providerMetadata?.localizedName || 'OpenAI Compatible'"
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
      </ProviderBasicSettings>

      <ProviderAdvancedSettings :title="t('settings.pages.providers.common.section.advanced.title')">
        <ProviderBaseUrlInput
          v-model="baseUrl"
          placeholder="https://api.example.com/v1/"
        />
        <FieldRange
          v-model="speed"
          :label="t('settings.pages.providers.provider.common.fields.field.speed.label')"
          :description="t('settings.pages.providers.provider.common.fields.field.speed.description')"
          :min="0.5"
          :max="2.0" :step="0.01"
        />
      </ProviderAdvancedSettings>
    </ProviderSettingsContainer>

    <SpeechPlaygroundOpenAICompatible
      v-model:model-value="model"
      v-model:voice="voice"
      :generate-speech="handleGenerateSpeech"
      :api-key-configured="apiKeyConfigured"
      default-text="Hello! This is a test of the OpenAI Compatible Speech."
    />
  </ProviderSettingsLayout>
</template>

<route lang="yaml">
  meta:
    layout: settings
    stageTransition:
      name: slide
  </route>
