<script setup lang="ts">
import type { SpeechProviderWithExtraOptions } from '@xsai-ext/shared-providers'
import type { UnElevenLabsOptions } from 'unspeech'

import {
  SpeechPlayground,
  SpeechProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { FieldCheckbox, FieldRange } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

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

const pitch = ref<number>(0)
const speed = ref<number>(1.0)
const volume = ref<number>(0)
const style = ref<number>(0)
const stability = ref<number>(0.5)
const similarityBoost = ref<number>(0.75)
const useSpeakerBoost = ref<boolean>(false)

const speechStore = useSpeechStore()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore)
const { t } = useI18n()

// Check if API key is configured
const apiKeyConfigured = computed(() => !!providers.value[providerId]?.apiKey)

// Get available voices for ElevenLabs
const availableVoices = computed(() => {
  return speechStore.availableVoices[providerId] || []
})

// Generate speech with ElevenLabs-specific parameters
async function handleGenerateSpeech(input: string, voiceId: string, _useSSML: boolean) {
  const provider = await providersStore.getProviderInstance(providerId) as SpeechProviderWithExtraOptions<string, UnElevenLabsOptions>
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

onMounted(async () => {
  const providerConfig = providersStore.getProviderConfig(providerId)
  const providerMetadata = providersStore.getProviderMetadata(providerId)
  if (await providerMetadata.validators.validateProviderConfig(providerConfig)) {
    await speechStore.loadVoicesForProvider(providerId)
  }
  else {
    console.error('Failed to validate provider config', providerConfig)
  }
})

watch(pitch, async () => {
  const providerConfig = providersStore.getProviderConfig(providerId)
  providerConfig.pitch = pitch.value
})

watch(speed, async () => {
  const providerConfig = providersStore.getProviderConfig(providerId)
  providerConfig.speed = speed.value
})

watch(volume, async () => {
  const providerConfig = providersStore.getProviderConfig(providerId)
  providerConfig.volume = volume.value
})

watch(style, async () => {
  const providerConfig = providersStore.getProviderConfig(providerId)
  providerConfig.style = style.value
})

watch(stability, async () => {
  const providerConfig = providersStore.getProviderConfig(providerId)
  providerConfig.stability = stability.value
})

watch(similarityBoost, async () => {
  const providerConfig = providersStore.getProviderConfig(providerId)
  providerConfig.similarityBoost = similarityBoost.value
})

watch(useSpeakerBoost, async () => {
  const providerConfig = providersStore.getProviderConfig(providerId)
  providerConfig.useSpeakerBoost = useSpeakerBoost.value
})

watch(providers, async () => {
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
    :additional-settings="defaultVoiceSettings"
  >
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

        <!-- Style control - specific to ElevenLabs -->
        <FieldRange
          v-model="style"
          :label="t('settings.pages.providers.provider.elevenlabs.fields.field.style.label')"
          :description="t('settings.pages.providers.provider.elevenlabs.fields.field.style.description')"
          :min="0"
          :max="1" :step="0.01"
        />

        <!-- Stability control - specific to ElevenLabs -->
        <FieldRange
          v-model="stability"
          :label="t('settings.pages.providers.provider.elevenlabs.fields.field.stability.label')"
          :description="t('settings.pages.providers.provider.elevenlabs.fields.field.stability.description')"
          :min="0"
          :max="1" :step="0.01"
        />

        <!-- Similarity Boost control - specific to ElevenLabs -->
        <FieldRange
          v-model="similarityBoost"
          :label="t('settings.pages.providers.provider.elevenlabs.fields.field.simularity-boost.label')"
          :description="t('settings.pages.providers.provider.elevenlabs.fields.field.simularity-boost.description')"
          :min="0"
          :max="1" :step="0.01"
        />

        <!-- Speaker Boost checkbox - specific to ElevenLabs -->
        <FieldCheckbox
          v-model="useSpeakerBoost"
          :label="t('settings.pages.providers.provider.elevenlabs.fields.field.speaker-boost.label')"
          :description="t('settings.pages.providers.provider.elevenlabs.fields.field.speaker-boost.description')"
        />
      </div>
    </template>

    <template #playground>
      <SpeechPlayground
        :available-voices="availableVoices"
        :generate-speech="handleGenerateSpeech"
        :api-key-configured="apiKeyConfigured"
        default-text="Hello! This is a test of the ElevenLabs voice synthesis."
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
