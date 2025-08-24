<script setup lang="ts">
import type { SpeechProviderWithExtraOptions } from '@xsai-ext/shared-providers'
import type { UnMicrosoftOptions } from 'unspeech'

import {
  SpeechPlayground,
  SpeechProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { FieldInput, FieldRange } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
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
  get: () => providers.value[providerId]?.region as string | undefined,
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = { region: 'eastasia' }

    providers.value[providerId].region = value
  },
})

// Check if API key is configured
const apiKeyConfigured = computed(() => !!providers.value[providerId]?.apiKey)

// Get available voices for Microsoft Speech
const availableVoices = computed(() => {
  return speechStore.availableVoices[providerId] || []
})

onMounted(async () => {
  if (!region.value) {
    region.value = 'eastasia' // Default region
  }
  if (!providers.value[providerId]?.region) {
    if (!providers.value[providerId])
      providers.value[providerId] = { region: region.value }
    else
      providers.value[providerId].region = region.value
  }

  await speechStore.loadVoicesForProvider(providerId)
})

watch([apiKeyConfigured, region], async () => {
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

    <!-- Voice settings specific to ElevenLabs -->
    <template #voice-settings>
      <div flex="~ col gap-4">
        <!-- Pitch control - common to most providers -->
        <FieldRange
          v-model="pitch"
          :label="t('settings.pages.providers.provider.common.fields.field.pitch.label')"
          :description="t('settings.pages.providers.provider.common.fields.field.pitch.description')"
          :min="-100"
          :max="100" :step="1" :format-value="value => `${value}%`"
        />

        <!-- Speed control - common to most providers -->
        <FieldRange
          v-model="speed"
          :label="t('settings.pages.providers.provider.common.fields.field.speed.label')"
          :description="t('settings.pages.providers.provider.common.fields.field.speed.description')"
          :min="0.5"
          :max="2.0" :step="0.01"
        />

        <!-- Volume control - available in some providers -->
        <FieldRange
          v-model="volume"
          :label="t('settings.pages.providers.provider.common.fields.field.volume.label')"
          :description="t('settings.pages.providers.provider.common.fields.field.volume.description')"
          :min="-100"
          :max="100" :step="1" :format-value="value => `${value}%`"
        />
      </div>
    </template>

    <!-- Replace the default playground with our standalone component -->
    <template #playground>
      <SpeechPlayground
        :available-voices="availableVoices"
        :generate-speech="handleGenerateSpeech"
        :api-key-configured="apiKeyConfigured"
        default-text="Hello! This is a test of the Microsoft Speech synthesis."
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
