<script setup lang="ts">
import type { TranscriptionProvider } from '@xsai-ext/shared-providers'

import {
  TranscriptionPlayground,
  TranscriptionProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { storeToRefs } from 'pinia'
import { computed, onMounted } from 'vue'

const hearingStore = useHearingStore()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore)

const providerId = 'openai-audio-transcription'
const defaultModel = 'whisper-1'

const apiKeyConfigured = computed(() => !!providers.value[providerId]?.apiKey)

// Ensure provider entry exists
onMounted(() => {
  providersStore.initializeProvider(providerId)
})

// Generate transcription
async function handleGenerateTranscription(file: File) {
  const provider = await providersStore.getProviderInstance<TranscriptionProvider<string>>(providerId)
  if (!provider) {
    throw new Error('Failed to initialize transcription provider')
  }

  const providerConfig = providersStore.getProviderConfig(providerId) ?? {}
  const model = (providerConfig.model as string | undefined) || defaultModel

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
