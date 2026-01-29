<script setup lang="ts">
import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'
import type { UnElevenLabsOptions } from 'unspeech'

import {
  Alert,
  SpeechPlayground,
  SpeechProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useProviderConfig } from '@proj-airi/stage-ui/composables/use-provider-config'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { FieldRange } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const providerId = 'player2-speech'
const defaultModel = 'v1'
const speedRatio = ref<number>(1.0)
const speechStore = useSpeechStore()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore)
const { t } = useI18n()
// Get available voices for Player2
const availableVoices = computed(() => {
  return speechStore.availableVoices[providerId] || []
})
// Generate speech with Player2-specific parameters
async function handleGenerateSpeech(input: string, voiceId: string, _useSSML: boolean) {
  const provider = await providersStore.getProviderInstance(providerId) as SpeechProviderWithExtraOptions<string, UnElevenLabsOptions>
  if (!provider) {
    throw new Error('Failed to initialize speech provider')
  }
  // Get provider configuration
  const providerConfig = providersStore.getProviderConfig(providerId)
  // Get model from configuration or use default
  const model = providerConfig.model as string | undefined || defaultModel
  // Player2 doesn't need SSML conversion, but if SSML is provided, use it directly
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
// Check if base URL is configured (Player2 doesn't require API key, only baseUrl)
// The voice loading logic already validates the full config
const { apiKeyConfigured } = useProviderConfig(providerId, {
  requireApiKey: false,
  requireBaseUrl: true,
})

const hasPlayer2 = ref(true)
onMounted(async () => {
  const providerConfig = providersStore.getProviderConfig(providerId)
  const providerMetadata = providersStore.getProviderMetadata(providerId)

  // Initialize provider if needed
  providersStore.initializeProvider(providerId)

  // Check if baseUrl is configured before trying to load voices
  const baseUrl = (providerConfig.baseUrl as string | undefined) ?? ''
  if (baseUrl && baseUrl.trim()) {
    // Only validate and load voices if baseUrl is configured
    const validationResult = await providerMetadata.validators.validateProviderConfig(providerConfig)
    if (validationResult.valid) {
      await speechStore.loadVoicesForProvider(providerId)
    }
    else {
      console.error('Failed to validate provider config', providerConfig)
    }

    // Check health status (non-blocking)
    try {
      const res = await fetch(`${baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl}/health`, {
        method: 'GET',
        headers: {
          'player2-game-key': 'airi',
        },
      })
      hasPlayer2.value = res.status === 200
    }
    catch (e) {
      console.error(e)
      hasPlayer2.value = false
    }
  }
  else {
    hasPlayer2.value = false
  }
})

watch(providers, async () => {
  const providerConfig = providersStore.getProviderConfig(providerId)
  const providerMetadata = providersStore.getProviderMetadata(providerId)

  // Only validate and load voices if baseUrl is configured
  const baseUrl = (providerConfig.baseUrl as string | undefined) ?? ''
  if (baseUrl && baseUrl.trim()) {
    const validationResult = await providerMetadata.validators.validateProviderConfig(providerConfig)
    if (validationResult.valid) {
      await speechStore.loadVoicesForProvider(providerId)
    }
    else {
      console.error('Failed to validate provider config', providerConfig)
    }
  }
}, {
  immediate: false, // Don't run immediately - wait for onMounted to initialize
})
watch(speedRatio, async () => {
  const providerConfig = providersStore.getProviderConfig(providerId)
  providerConfig.speed = speedRatio.value
})
</script>

<template>
  <SpeechProviderSettings
    :provider-id="providerId"
    :default-model="defaultModel"
  >
    <template #voice-settings>
      <!-- Speed control - common to most providers -->
      <FieldRange
        v-model="speedRatio"
        :label="t('settings.pages.providers.provider.common.fields.field.speed.label')"
        :description="t('settings.pages.providers.provider.common.fields.field.speed.description')"
        :min="0.5"
        :max="5.0" :step="0.01"
      />
    </template>

    <!-- Replace the default playground with our standalone component -->
    <template #playground>
      <SpeechPlayground
        :available-voices="availableVoices"
        :generate-speech="handleGenerateSpeech"
        :api-key-configured="apiKeyConfigured"
        default-text="Hello! This is a test of the Player 2 voice synthesis."
      />
    </template>
  </SpeechProviderSettings>
  <Alert v-if="!hasPlayer2" type="error">
    <template #title>
      {{ t('settings.dialogs.onboarding.validationFailed') }}
    </template>
    <template #content>
      <div class="whitespace-pre-wrap break-all">
        <div>
          Please download and run the Player2 App:
          <a href="https://player2.game" target="_blank" rel="noopener noreferrer">
            https://player2.game
          </a>

          <div>
            After downloading, if you still are having trouble, please reach out to us on Discord:
            <a href="https://player2.game/discord" target="_blank" rel="noopener noreferrer">
              https://player2.game/discord
            </a>.
          </div>
        </div>
      </div>
    </template>
  </Alert>
</template>

<route lang="yaml">
  meta:
    layout: settings
    stageTransition:
      name: slide
  </route>
