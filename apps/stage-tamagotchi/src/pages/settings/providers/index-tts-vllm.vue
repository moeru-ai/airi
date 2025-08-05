<script setup lang="ts">
import type { SpeechProviderWithExtraOptions } from '@xsai-ext/shared-providers'
import type { UnMicrosoftOptions } from 'unspeech'

import {
  SpeechPlayground,
  SpeechProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useProvidersStore, useSpeechStore } from '@proj-airi/stage-ui/stores'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
// import { useI18n } from 'vue-i18n'

// const { t } = useI18n()

const providerId = 'index-tts-vllm'
const defaultModel = 'IndexTTS-1.5'

// Default voice settings specific to Microsoft Speech
const defaultVoiceSettings = {
  pitch: 0,
  speed: 1.0,
  volume: 0,
}

const speechStore = useSpeechStore()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore)

const pitch = ref(0)

// Check if API key is configured
const apiKeyConfigured = computed(() => !!providers.value[providerId]?.apiKey)

// Get available voices for Microsoft Speech
const availableVoices = computed(() => {
  return speechStore.availableVoices[providerId] || []
})

onMounted(async () => {
  await speechStore.loadVoicesForProvider(providerId)
})

watch([apiKeyConfigured], async () => {
  await speechStore.loadVoicesForProvider(providerId)
})

// Generate speech with Microsoft-specific parameters
async function handleGenerateSpeech(input: string, voiceId: string, useSSML: boolean) {
  const provider = await providersStore.getProviderInstance(providerId) as SpeechProviderWithExtraOptions<string, UnMicrosoftOptions>
  if (!provider) {
    throw new Error('Failed to initialize speech provider')
  }

  // Get provider configuration
  const providerConfig = providersStore.getProviderConfig(providerId)

  // Get model from configuration or use default
  const model = providerConfig.model as string | undefined || defaultModel

  const options = {
    ...providerConfig,
    disableSsml: !useSSML, // If useSSML is true, we don't disable SSML
  }

  // If not using SSML and we have a voice, generate SSML
  if (!useSSML && voiceId) {
    const voice = availableVoices.value.find(v => v.id === voiceId)
    if (voice) {
      const ssml = speechStore.generateSSML(
        input,
        voice,
        { ...providerConfig, pitch: pitch.value },
      )
      return await speechStore.speech(
        provider,
        model,
        ssml,
        voiceId,
        options,
      )
    }
  }

  // Either using direct SSML or no voice found
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
  <SpeechProviderSettings
    :provider-id="providerId" :default-model="defaultModel"
    :additional-settings="defaultVoiceSettings"
  >
    <!-- Replace the default playground with our standalone component -->
    <template #playground>
      <SpeechPlayground
        :available-voices="availableVoices" :generate-speech="handleGenerateSpeech"
        :api-key-configured="apiKeyConfigured"
        default-text="Hello! This is a test of the Index TTS Speech synthesis."
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
