<script setup lang="ts">
import type { UnElevenLabsOptions } from '@xsai-ext/providers-local'
import type { SpeechProviderWithExtraOptions } from '@xsai-ext/shared-providers'

import {
  SpeechPlayground,
  SpeechProviderSettings,
  SpeechVoiceSettings,
} from '@proj-airi/stage-ui/components'
import { useProvidersStore, useSpeechStore } from '@proj-airi/stage-ui/stores'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

const providerId = 'elevenlabs'
const defaultModel = 'eleven_multilingual_v2'

// Default voice settings specific to ElevenLabs
const defaultVoiceSettings = {
  similarityBoost: 0.75,
  stability: 0.5,
  speed: 1.0,
  style: 0,
  useSpeakerBoost: true,
}

const speechStore = useSpeechStore()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore)

// Check if API key is configured
const apiKeyConfigured = computed(() => !!providers.value[providerId]?.apiKey)

// Get available voices for ElevenLabs
const availableVoices = computed(() => {
  return speechStore.availableVoices[providerId] || []
})

// Get available languages
const availableLanguages = computed(() => {
  return speechStore.availableLanguages
})

// Generate speech with ElevenLabs-specific parameters
async function handleGenerateSpeech(input: string, voiceId: string, _useSSML: boolean) {
  const provider = providersStore.getProviderInstance(providerId) as SpeechProviderWithExtraOptions<string, UnElevenLabsOptions>
  if (!provider) {
    throw new Error('Failed to initialize speech provider')
  }

  // Get provider configuration
  const providerConfig = providersStore.getProviderConfig(providerId)

  // Get model from configuration or use default
  const model = providerConfig.model as string | undefined || defaultModel

  // ElevenLabs doesn't need SSML conversion, but if SSML is provided, use it directly
  return await speechStore.speech(
    provider,
    model,
    input,
    voiceId,
    {
      ...providerConfig,
      ...defaultVoiceSettings,
    },
  )
}
</script>

<template>
  <SpeechProviderSettings
    :provider-id="providerId"
    :default-model="defaultModel"
    :additional-settings="defaultVoiceSettings"
  >
    <!-- Voice settings specific to ElevenLabs -->
    <template #voice-settings="{ voiceSettings, updateVoiceSettings }">
      <SpeechVoiceSettings
        :settings="voiceSettings"
        :show-similarity-boost="true"
        :show-stability="true"
        :show-speed="true"
        :show-style="true"
        :show-speaker-boost="true"
        @update="updateVoiceSettings"
      />
    </template>

    <!-- Replace the default playground with our standalone component -->
    <template #playground>
      <SpeechPlayground
        :available-voices="availableVoices"
        :available-languages="availableLanguages"
        :generate-speech="handleGenerateSpeech"
        :api-key-configured="apiKeyConfigured"
        default-text="Hello! This is a test of the ElevenLabs voice synthesis."
      />
    </template>
  </SpeechProviderSettings>
</template>
