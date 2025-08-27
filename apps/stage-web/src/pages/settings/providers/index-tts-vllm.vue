<script setup lang="ts">
import type { SpeechProvider } from '@xsai-ext/shared-providers'

import {
  SpeechPlayground,
  SpeechProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { storeToRefs } from 'pinia'
import { computed, watch } from 'vue'
// import { useI18n } from 'vue-i18n'

const providerId = 'index-tts-vllm'
const defaultModel = 'IndexTTS-1.5'

const speechStore = useSpeechStore()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore)
// const { t } = useI18n()

// Check if API key is configured
// const apiKeyConfigured = computed(() => !!providers.value[providerId]?.apiKey)
const apiKeyConfigured = true // Assuming API key is always configured as its not required

// Get available voices for Index TTS
const availableVoices = computed(() => {
  return speechStore.availableVoices[providerId] || []
})

// Generate speech with IndexTTS-specific parameters
async function handleGenerateSpeech(input: string, voiceId: string, _useSSML: boolean) {
  const provider = await providersStore.getProviderInstance(providerId) as SpeechProvider
  if (!provider) {
    throw new Error('Failed to initialize speech provider')
  }

  // Get provider configuration
  const providerConfig = providersStore.getProviderConfig(providerId)

  // Get model from configuration or use default
  const model = providerConfig.model as string | undefined || defaultModel

  // Index TTS doesn't need SSML conversion, but if SSML is provided, use it directly
  return await speechStore.speech(
    provider,
    model,
    input,
    voiceId,
    {
      ...providerConfig,
    },
  )
}

watch([providers], async () => {
  const providerConfig = providersStore.getProviderConfig(providerId)
  const providerMetadata = providersStore.getProviderMetadata(providerId)
  if (await providerMetadata.validators.validateProviderConfig(providerConfig)) {
    await speechStore.loadVoicesForProvider(providerId)
  }
  else {
    console.error('Failed to validate provider config', providerConfig)
  }
}, {
  immediate: true,
})
</script>

<template>
  <SpeechProviderSettings
    :provider-id="providerId"
    :default-model="defaultModel"
  >
    <!-- Replace the default playground with our standalone component -->
    <template #playground>
      <SpeechPlayground
        :available-voices="availableVoices"
        :generate-speech="handleGenerateSpeech"
        :api-key-configured="apiKeyConfigured"
        default-text="Hello! This is a test of the Index TTS voice synthesis."
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
