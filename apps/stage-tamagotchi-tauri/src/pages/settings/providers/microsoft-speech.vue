<script setup lang="ts">
import type { UnMicrosoftOptions } from '@xsai-ext/providers-local'
import type { SpeechProviderWithExtraOptions } from '@xsai-ext/shared-providers'

import {
  FieldInput,
  SpeechPlayground,
  SpeechProviderSettings,
  SpeechVoiceSettings,
} from '@proj-airi/stage-ui/components'
import { useProvidersStore, useSpeechStore } from '@proj-airi/stage-ui/stores'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const providerId = 'microsoft-speech'
const defaultModel = 'v1'

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
const speed = ref(1.0)
const volume = ref(0)

// Additional settings specific to Microsoft Speech (region)
const region = computed({
  get: () => providers.value[providerId]?.region as string | undefined || 'eastasia',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}

    providers.value[providerId].region = value
  },
})

// Check if API key is configured
const apiKeyConfigured = computed(() => !!providers.value[providerId]?.apiKey)

// Get available voices for Microsoft Speech
const availableVoices = computed(() => {
  return speechStore.availableVoices[providerId] || []
})

// Get available languages
const availableLanguages = computed(() => {
  return speechStore.availableLanguages
})

// Generate speech with Microsoft-specific parameters
async function handleGenerateSpeech(input: string, voiceId: string, useSSML: boolean) {
  const provider = providersStore.getProviderInstance(providerId) as SpeechProviderWithExtraOptions<string, UnMicrosoftOptions>
  if (!provider) {
    throw new Error('Failed to initialize speech provider')
  }

  // Get provider configuration
  const providerConfig = providersStore.getProviderConfig(providerId)

  // Get model from configuration or use default
  const model = providerConfig.model as string | undefined || defaultModel

  // For Microsoft Speech, we need to ensure we're using the right region
  const options = {
    ...providerConfig,
    region: region.value,
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
    :provider-id="providerId"
    :default-model="defaultModel"
    :additional-settings="defaultVoiceSettings"
  >
    <!-- Basic settings specific to Microsoft Speech -->
    <template #basic-settings>
      <FieldInput
        v-model="region"
        :label="t('settings.pages.providers.provider.microsoft-speech.fields.field.region.label')"
        :description="t('settings.pages.providers.provider.microsoft-speech.fields.field.region.description')"
        placeholder="eastasia"
        required
        type="text"
      />
    </template>

    <!-- Voice settings specific to Microsoft Speech -->
    <template #voice-settings="{ voiceSettings, updateVoiceSettings }">
      <SpeechVoiceSettings
        v-model:pitch="pitch"
        v-model:speed="speed"
        v-model:volume="volume"
        :settings="voiceSettings"
        :show-pitch="true"
        :show-speed="true"
        :show-volume="true"
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
        default-text="Hello! This is a test of the Microsoft Speech synthesis."
      />
    </template>
  </SpeechProviderSettings>
</template>
