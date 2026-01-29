<script setup lang="ts">
import type { SpeechProvider } from '@xsai-ext/providers/utils'

import {
  SpeechPlayground,
  SpeechProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useProviderConfig } from '@proj-airi/stage-ui/composables/use-provider-config'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { FieldRange, FieldSelect } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const speechStore = useSpeechStore()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore)
const { t } = useI18n()

const defaultVoiceSettings = {
  speed: 1.0,
}

// Get provider metadata
const providerId = 'comet-api-speech'
const defaultModel = 'gpt-4o-mini-tts'

const speed = ref<number>(1.0)

// Model selection
const model = computed({
  get: () => providers.value[providerId]?.model as string | undefined || defaultModel,
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

// Check if API key is configured (required for voice dropdown to work)
// The voice loading logic already validates the full config (API key + base URL)
const { apiKeyConfigured } = useProviderConfig(providerId)

const availableVoices = computed(() => {
  return speechStore.availableVoices[providerId] || []
})

// Load models on mount
onMounted(async () => {
  await providersStore.loadModelsForConfiguredProviders()
  await providersStore.fetchModelsForProvider(providerId)
})

// Generate speech with CometAPI-specific parameters
async function handleGenerateSpeech(input: string, voiceId: string, _useSSML: boolean) {
  const provider = await providersStore.getProviderInstance<SpeechProvider<string>>(providerId)
  if (!provider) {
    throw new Error('Failed to initialize speech provider')
  }

  // Get provider configuration
  const providerConfig = providersStore.getProviderConfig(providerId)

  // Get model from configuration or use default
  const modelToUse = providerConfig.model as string | undefined || defaultModel

  return await speechStore.speech(
    provider,
    modelToUse,
    input,
    voiceId,
    {
      ...providerConfig,
      ...defaultVoiceSettings,
    },
  )
}

watch(speed, async () => {
  const providerConfig = providersStore.getProviderConfig(providerId)
  providerConfig.speed = speed.value
})

watch(model, () => {
  const providerConfig = providersStore.getProviderConfig(providerId)
  providerConfig.model = model.value
})
</script>

<template>
  <SpeechProviderSettings
    :provider-id="providerId"
    :default-model="defaultModel"
    :additional-settings="defaultVoiceSettings"
  >
    <template #basic-settings>
      <!-- Model selection -->
      <FieldSelect
        v-model="model"
        label="Model"
        description="Select the text-to-speech model to use"
        :options="providerModels.map(m => ({ value: m.id, label: m.name }))"
        :disabled="isLoadingModels || providerModels.length === 0"
        placeholder="Select a model..."
      />
    </template>

    <!-- Voice settings specific to CometAPI -->
    <template #voice-settings>
      <!-- Speed control - common to most providers -->
      <FieldRange
        v-model="speed"
        :label="t('settings.pages.providers.provider.common.fields.field.speed.label')"
        :description="t('settings.pages.providers.provider.common.fields.field.speed.description')"
        :min="0.5"
        :max="2.0" :step="0.01"
      />
    </template>

    <template #playground>
      <SpeechPlayground
        :available-voices="availableVoices"
        :generate-speech="handleGenerateSpeech"
        :api-key-configured="apiKeyConfigured"
        default-text="Hello! This is a test of the OpenAI Speech."
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
