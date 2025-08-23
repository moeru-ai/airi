<script setup lang="ts">
import type { TranscriptionProvider } from '@xsai-ext/shared-providers'

import {
  TranscriptionPlayground,
  TranscriptionProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useHearingStore, useProvidersStore } from '@proj-airi/stage-ui/stores'
import { FieldSelect } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

const hearingStore = useHearingStore()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore)

// Get provider metadata
const providerId = 'app-local-whisper-transcription'
const defaultModel = 'whisper-tiny'

// Available Whisper models
const whisperModels = [
  { label: 'Tiny (39 MB)', value: 'whisper-tiny' },
  { label: 'Base (74 MB)', value: 'whisper-base' },
  { label: 'Small (244 MB)', value: 'whisper-small' },
  { label: 'Medium (769 MB)', value: 'whisper-medium' },
  { label: 'Large (1550 MB)', value: 'whisper-large' },
]

// Model selection
const selectedModel = computed({
  get: () => providers.value[providerId]?.model as string | undefined || defaultModel,
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}

    providers.value[providerId].model = value
  },
})

// Check if provider is configured (model is selected)
const isConfigured = computed(() => !!providers.value[providerId]?.model)

// Generate transcription with Whisper-specific parameters
async function handleGenerateTranscription(file: File) {
  const provider = await providersStore.getProviderInstance<TranscriptionProvider<string>>(providerId)
  if (!provider) {
    throw new Error('Failed to initialize Whisper provider')
  }

  // Get provider configuration
  const providerConfig = providersStore.getProviderConfig(providerId)

  // Get model from configuration or use default
  const model = providerConfig.model as string | undefined || defaultModel

  return await hearingStore.transcription(
    provider,
    model,
    file,
    'json',
  )
}
</script>

<template>
  <TranscriptionProviderSettings
    :provider-id="providerId"
    :default-model="defaultModel"
    placeholder="Whisper не требует API ключ"
  >
    <template #basic-settings>
      <FieldSelect
        v-model="selectedModel"
        label="Whisper Model"
        description="Выберите модель Whisper для транскрипции. Большие модели более точные, но требуют больше памяти."
        :options="whisperModels"
        layout="vertical"
      />
    </template>

    <template #playground>
      <TranscriptionPlayground
        :generate-transcription="handleGenerateTranscription"
        :api-key-configured="isConfigured"
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