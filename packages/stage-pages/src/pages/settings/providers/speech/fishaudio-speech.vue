<script setup lang="ts">
import type { SpeechProvider } from '@xsai-ext/providers/utils'

import {
  SpeechPlayground,
  SpeechProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { getFishAudioApiKey } from '@proj-airi/stage-ui/stores/providers/fishaudio'
import { FieldCombobox } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, watch } from 'vue'

interface FishAudioProviderConfig {
  apiKey?: string
  baseUrl?: string
  model?: string
}

const speechStore = useSpeechStore()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore)
const { activeSpeechVoiceId } = storeToRefs(speechStore)

const providerId = 'fishaudio-speech'
const defaultModel = 's2-pro'

function ensureProviderConfig(): FishAudioProviderConfig {
  if (!providers.value[providerId]) {
    providers.value[providerId] = {}
  }

  return providers.value[providerId] as FishAudioProviderConfig
}

const config = computed(() => providers.value[providerId] as FishAudioProviderConfig | undefined)

const model = computed({
  get: () => config.value?.model || defaultModel,
  set: (value: string) => {
    ensureProviderConfig().model = value
  },
})

const modelOptions = computed(() => {
  return providersStore.getModelsForProvider(providerId).map(model => ({
    value: model.id,
    label: model.name,
  }))
})

const isLoadingModels = computed(() => providersStore.isLoadingModels[providerId] || false)
const apiKey = computed(() => getFishAudioApiKey(config.value?.apiKey))
const apiKeyConfigured = computed(() => {
  return Boolean(providersStore.configuredProviders[providerId]) && Boolean(apiKey.value)
})

async function loadProviderConfiguration() {
  await providersStore.fetchModelsForProvider(providerId)

  const providerConfig = providersStore.getProviderConfig(providerId)
  const providerMetadata = providersStore.getProviderMetadata(providerId)
  const validationResult = await providerMetadata.validators.validateProviderConfig(providerConfig)
  if (!validationResult.valid) {
    return
  }

  await providersStore.validateProvider(providerId, { force: true })
}

onMounted(async () => {
  ensureProviderConfig()

  if (!config.value?.model) {
    model.value = defaultModel
  }

  await providersStore.loadModelsForConfiguredProviders()
  await loadProviderConfiguration()
})

watch(apiKey, async (newApiKey, previousApiKey) => {
  if (!newApiKey) {
    providersStore.setProviderUnconfigured(providerId)
    return
  }

  if (newApiKey === previousApiKey) {
    return
  }

  await providersStore.validateProvider(providerId, { force: true })
})

async function handleGenerateSpeech(input: string, voiceId: string, _useSSML: boolean) {
  const provider = await providersStore.getProviderInstance<SpeechProvider<string>>(providerId)
  if (!provider) {
    throw new Error('Failed to initialize speech provider')
  }

  const providerConfig = providersStore.getProviderConfig(providerId)
  return await speechStore.speech(
    provider,
    model.value || defaultModel,
    input,
    voiceId,
    providerConfig,
  )
}
</script>

<template>
  <SpeechProviderSettings :provider-id="providerId" :default-model="defaultModel">
    <template #voice-settings>
      <FieldCombobox
        v-model="model"
        label="Model"
        description="Select the Fish Audio speech model to use for synthesis"
        :options="modelOptions"
        :disabled="isLoadingModels || modelOptions.length === 0"
        placeholder="Select a model..."
      />
    </template>

    <template #playground>
      <SpeechPlayground
        v-model:selected-voice="activeSpeechVoiceId"
        :available-voices="[]"
        audio-mime-type="audio/mpeg"
        :generate-speech="handleGenerateSpeech"
        :hide-voice-selection="true"
        :api-key-configured="apiKeyConfigured"
        default-text="Hello! This is a test of the Fish Audio speech synthesis."
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
