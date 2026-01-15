<script setup lang="ts">
import type { SpeechProvider } from '@xsai-ext/providers/utils'

import {
  SpeechPlayground,
  SpeechProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { FieldRange } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const speechStore = useSpeechStore()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore)
const { t } = useI18n()

// Get provider metadata
const providerId = 'siliconflow-speech'
const defaultModel = 'FunAudioLLM/CosyVoice2-0.5B'

const speed = ref<number>(1.0)

// Check if API key is configured
const apiKeyConfigured = computed(() => !!providers.value[providerId]?.apiKey)

const availableVoices = computed(() => {
  return speechStore.availableVoices[providerId] || []
})

// Generate speech with SiliconFlow-specific parameters
async function handleGenerateSpeech(input: string, voiceId: string, _useSSML: boolean) {
  const provider = await providersStore.getProviderInstance<SpeechProvider<string>>(providerId)
  if (!provider) {
    throw new Error('Failed to initialize speech provider')
  }

  // Get provider configuration
  const providerConfig = providersStore.getProviderConfig(providerId)

  // Get model from configuration or use default
  const model = providerConfig.model as string | undefined || defaultModel

  // SiliconFlow uses OpenAI-compatible API, voice parameter is already in correct format (model:voice_name)
  return await speechStore.speech(
    provider,
    model,
    input,
    voiceId,
    providerConfig,
  )
}

watch(speed, async () => {
  const providerConfig = providersStore.getProviderConfig(providerId)
  providerConfig.speed = speed.value
})
</script>

<template>
  <SpeechProviderSettings
    :provider-id="providerId"
    :default-model="defaultModel"
  >
    <!-- Voice settings specific to SiliconFlow -->
    <template #voice-settings>
      <!-- Speed control - common to most providers -->
      <FieldRange
        v-model="speed"
        :label="t('settings.pages.providers.provider.common.fields.field.speed.label')"
        :description="t('settings.pages.providers.provider.common.fields.field.speed.description')"
        :min="0.25"
        :max="4.0" :step="0.01"
      />
    </template>

    <template #playground>
      <SpeechPlayground
        :available-voices="availableVoices"
        :generate-speech="handleGenerateSpeech"
        :api-key-configured="apiKeyConfigured"
        default-text="Hello! This is a test of SiliconFlow speech synthesis."
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
