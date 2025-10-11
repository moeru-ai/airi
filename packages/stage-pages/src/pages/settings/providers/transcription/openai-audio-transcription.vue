<script setup lang="ts">
import type { TranscriptionProvider } from '@xsai-ext/shared-providers'

import {
  TranscriptionPlayground,
  TranscriptionProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

const hearingStore = useHearingStore()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore)

// Get provider metadata
const providerId = 'openai-audio-transcription'
const defaultModel = 'whisper-1'

// Check if API key is configured
const apiKeyConfigured = computed(() => !!providers.value[providerId]?.apiKey)

// Generate speech with ElevenLabs-specific parameters
async function handleGenerateTranscription(file: File) {
  const provider = await providersStore.getProviderInstance<TranscriptionProvider<string>>(providerId)
  if (!provider) {
    throw new Error('Failed to initialize speech provider')
  }

  // Get provider configuration
  const providerConfig = providersStore.getProviderConfig(providerId)

  // Get model from configuration or use default
  const model = providerConfig.model as string | undefined || defaultModel

  // ElevenLabs doesn't need SSML conversion, but if SSML is provided, use it directly
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
  >
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
