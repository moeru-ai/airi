<script setup lang="ts">
import type { SpeechProvider } from '@xsai-ext/providers/utils'

import {
  SpeechPlayground,
  SpeechProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { FieldCombobox, FieldRange } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted } from 'vue'

const speechStore = useSpeechStore()
const providersStore = useProviderStore()
const providerStore = useProviderConfigStore()
const { configs: providers } = storeToRefs(providerStore)

interface GoogleGeminiSpeechProviderConfig {
  apiKey?: string
  baseUrl?: string
  model?: string
  voice?: string
  temperature?: number
}

const providerId = 'google-gemini-audio-speech'
const defaultModel = 'gemini-2.5-flash-preview-tts'

const config = computed(() => providers.value[providerId] as GoogleGeminiSpeechProviderConfig | undefined)

function ensureProviderConfig(): GoogleGeminiSpeechProviderConfig {
  if (!providers.value[providerId])
    providers.value[providerId] = {}

  return providers.value[providerId] as GoogleGeminiSpeechProviderConfig
}

const providerModels = computed(() => providersStore.getModelsForProvider(providerId))
const modelOptions = computed(() => {
  return (providerModels.value.length > 0 ? providerModels.value : []).map(model => ({
    value: model.id,
    label: model.name,
  }))
})

const availableVoices = computed(() => speechStore.availableVoices[providerId] || [])

const model = computed({
  get: () => config.value?.model || defaultModel,
  set: (value) => {
    ensureProviderConfig().model = value
  },
})

const temperature = computed({
  get: () => config.value?.temperature ?? 1.0,
  set: (value) => {
    ensureProviderConfig().temperature = value
  },
})

const apiKeyConfigured = computed(() => !!providers.value[providerId]?.apiKey)

onMounted(async () => {
  ensureProviderConfig()

  if (!config.value?.model)
    model.value = defaultModel

  await providersStore.loadModelsForConfiguredProviders()
  await providersStore.fetchModelsForProvider(providerId)
  await speechStore.loadVoicesForProvider(providerId)
})

async function handleGenerateSpeech(input: string, voiceId: string, _useSSML: boolean, modelId?: string) {
  const provider = await providersStore.getProviderInstance<SpeechProvider<string>>(providerId)
  if (!provider)
    throw new Error('Failed to initialize speech provider')

  const providerConfig = providerStore.getProviderConfig(providerId)
  const modelToUse = modelId || model.value || defaultModel
  const voiceToUse = voiceId || '' as string

  return await speechStore.speech(
    provider,
    modelToUse,
    input,
    voiceToUse,
    providerConfig,
  )
}
</script>

<template>
  <SpeechProviderSettings
    :provider-id="providerId"
    :default-model="defaultModel"
  >
    <template #voice-settings>
      <FieldCombobox
        v-model="model"
        label="Model"
        description="Select the Gemini TTS model to use for speech generation"
        :options="modelOptions"
        placeholder="Select a Gemini model..."
      />
      <FieldRange
        v-model="temperature"
        label="Temperature"
        description="Controls randomness in speech generation. Lower values make speech more predictable, higher values make it more creative."
        :min="0"
        :max="2"
        :step="0.1"
        :format-value="(value) => value.toFixed(1)"
      />
    </template>

    <template #playground>
      <SpeechPlayground
        :available-voices="availableVoices"
        :generate-speech="handleGenerateSpeech"
        :api-key-configured="apiKeyConfigured"
        :voices-loading="speechStore.isLoadingSpeechProviderVoices"
        default-text="Hello! This is a test of the Google Gemini Speech."
      />
    </template>
  </SpeechProviderSettings>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
