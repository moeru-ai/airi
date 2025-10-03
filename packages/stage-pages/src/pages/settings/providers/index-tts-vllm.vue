<script setup lang="ts">
import type { SpeechProvider } from '@xsai-ext/shared-providers'

import {
  SpeechPlayground,
  SpeechProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { computed, onMounted, watch } from 'vue'
// import { useI18n } from 'vue-i18n'

// const { t } = useI18n()

const providerId = 'index-tts-vllm'
const defaultModel = 'IndexTTS-1.5'

const speechStore = useSpeechStore()
const providersStore = useProvidersStore()
// const { providers } = storeToRefs(providersStore)

// Check if API key is configured
// const apiKeyConfigured = computed(() => !!providers.value[providerId]?.apiKey)
const apiKeyConfigured = true // Assuming API key is always configured as its not required

// Get available voices for Index TTS provider
const availableVoices = computed(() => {
  return speechStore.availableVoices[providerId] || []
})

onMounted(async () => {
  await speechStore.loadVoicesForProvider(providerId)
})

watch([apiKeyConfigured], async () => {
  await speechStore.loadVoicesForProvider(providerId)
})

async function handleGenerateSpeech(input: string, voiceId: string) {
  const provider = await providersStore.getProviderInstance(providerId) as SpeechProvider
  if (!provider) {
    throw new Error('Failed to initialize speech provider')
  }

  // Get provider configuration
  const providerConfig = providersStore.getProviderConfig(providerId)

  // Get model from configuration or use default
  const model = providerConfig.model as string | undefined || defaultModel

  const options = {
    ...providerConfig,
  }

  return await speechStore.speech(
    provider,
    model,
    input,
    voiceId,
    options,
  )
}
</script>

<template>
  <SpeechProviderSettings :provider-id="providerId" :default-model="defaultModel">
    <!-- Replace the default playground with our standalone component -->
    <template #playground>
      <SpeechPlayground
        :available-voices="availableVoices" :generate-speech="handleGenerateSpeech"
        :api-key-configured="apiKeyConfigured" :use-ssml="false"
        default-text="Hello! This is a test of the Index TTS Speech synthesis?."
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
