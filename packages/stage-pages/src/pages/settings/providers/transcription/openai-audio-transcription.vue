<script setup lang="ts">
import type { TranscriptionProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import {
  TranscriptionPlayground,
  TranscriptionProviderSettings,
} from '@proj-airi/stage-ui/components'
import { OPENAI_TRANSCRIPTION_DEFAULT_MODEL } from '@proj-airi/stage-ui/libs/providers/providers/openai-audio'
import { resolveOpenAITranscriptionModel, useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { FieldCombobox } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted } from 'vue'

import {
  createOpenAIAudioTranscriptionController,
  OPENAI_AUDIO_TRANSCRIPTION_PROVIDER_ID,
} from './openai-audio-transcription'

const hearingStore = useHearingStore()
const providersStore = useProviderStore()
const providerStore = useProviderConfigStore()
const { configs: providers } = storeToRefs(providerStore)

// Get provider metadata
const providerId = OPENAI_AUDIO_TRANSCRIPTION_PROVIDER_ID
const defaultModel = OPENAI_TRANSCRIPTION_DEFAULT_MODEL
const {
  generateTranscription: handleGenerateTranscription,
  updateModel,
} = createOpenAIAudioTranscriptionController({
  getProvider: () => providersStore.getProviderInstance<TranscriptionProviderWithExtraOptions<string, any>>(providerId),
  getProviderConfig: () => providerStore.getProviderConfig(providerId),
  reportModelSaveError: cause => console.warn('Failed to update the transcription model:', cause),
  saveModel: model => hearingStore.setTranscriptionModelForProvider(providerId, model),
  transcribe: (provider, model, file) => hearingStore.transcription(
    providerId,
    provider,
    model,
    file,
    'json',
  ),
})

// Model selection
const model = computed(() => resolveOpenAITranscriptionModel(providers.value[providerId]))

// Load models
const providerModels = computed(() => {
  return providersStore.getModelsForProvider(providerId)
})

const isLoadingModels = computed(() => {
  return providersStore.isLoadingModels[providerId] || false
})

// Check if API key is configured
const apiKeyConfigured = computed(() => !!providers.value[providerId]?.apiKey)

// Load models on mount
onMounted(async () => {
  await providersStore.loadModelsForConfiguredProviders()
  await providersStore.fetchModelsForProvider(providerId)
})
</script>

<template>
  <TranscriptionProviderSettings
    :provider-id="providerId"
    :default-model="defaultModel"
  >
    <template #basic-settings>
      <!-- Model selection -->
      <FieldCombobox
        :model-value="model"
        label="Model"
        description="Select the transcription model to use"
        :options="providerModels.map(m => ({ value: m.id, label: m.name }))"
        :disabled="isLoadingModels || providerModels.length === 0"
        placeholder="Select a model..."
        @update:model-value="updateModel"
      />
    </template>
    <template #playground>
      <TranscriptionPlayground
        :generate-transcription="handleGenerateTranscription"
        :api-key-configured="apiKeyConfigured"
      />
    </template>
  </TranscriptionProviderSettings>
</template>

<route lang="yaml">
  meta:
    layout: settings
    stageTransition:
      name: slide
  </route>
