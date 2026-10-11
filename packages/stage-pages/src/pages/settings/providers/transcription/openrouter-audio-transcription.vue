<script setup lang="ts">
import type { TranscriptionProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import {
  TranscriptionPlayground,
  TranscriptionProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { storeToRefs } from 'pinia'
import { computed, onMounted } from 'vue'

const hearingStore = useHearingStore()
const providersStore = useProviderStore()
const providerConfigStore = useProviderConfigStore()
const { configs: providers } = storeToRefs(providerConfigStore)
const providerId = 'openrouter-audio-transcription'

const apiKeyConfigured = computed(() => Boolean(providers.value[providerId]?.apiKey))

onMounted(async () => {
  await providersStore.loadModelsForConfiguredProviders()
  await providersStore.fetchModelsForProvider(providerId)
})

async function handleGenerateTranscription(file: File) {
  const model = hearingStore.activeTranscriptionModel
  if (!model)
    throw new Error('Select a transcription model in Hearing settings before testing.')

  const provider = await providersStore.getProviderInstance<TranscriptionProviderWithExtraOptions<string, Record<string, unknown>>>(providerId)
  if (!provider)
    throw new Error('Failed to initialize transcription provider')

  return await hearingStore.transcription(providerId, provider, model, file, 'json')
}
</script>

<template>
  <TranscriptionProviderSettings :provider-id="providerId">
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
