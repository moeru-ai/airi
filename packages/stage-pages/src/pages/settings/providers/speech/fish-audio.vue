<script setup lang="ts">
import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import {
  SpeechPlayground,
  SpeechProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { storeToRefs } from 'pinia'
import { computed, onMounted, watch } from 'vue'

const providerId = 'fish-audio'
const defaultModel = 's2-pro'

const speechStore = useSpeechStore()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore)

const apiKeyConfigured = computed(() => !!providers.value[providerId]?.apiKey)

const availableVoices = computed(() => speechStore.availableVoices[providerId] || [])

async function handleGenerateSpeech(input: string, voiceId: string, _useSSML: boolean) {
  const provider = await providersStore.getProviderInstance(providerId) as SpeechProviderWithExtraOptions<string>
  if (!provider) {
    throw new Error('Failed to initialize speech provider')
  }

  const providerConfig = providersStore.getProviderConfig(providerId)
  const model = providerConfig.model as string | undefined || defaultModel

  return await speechStore.speech(
    provider,
    model,
    input,
    voiceId,
    { ...providerConfig },
  )
}

async function tryLoadVoices() {
  if (apiKeyConfigured.value) {
    await speechStore.loadVoicesForProvider(providerId)
  }
}

onMounted(tryLoadVoices)

// Reload voices whenever the API key or base URL changes
watch(
  () => [providers.value[providerId]?.apiKey, providers.value[providerId]?.baseUrl],
  tryLoadVoices,
)
</script>

<template>
  <SpeechProviderSettings
    :provider-id="providerId"
    :default-model="defaultModel"
  >
    <template #playground>
      <SpeechPlayground
        :available-voices="availableVoices"
        :generate-speech="handleGenerateSpeech"
        :api-key-configured="apiKeyConfigured"
        :voices-loading="speechStore.isLoadingSpeechProviderVoices"
        default-text="Hello! This is a test of the Fish Audio voice synthesis."
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
