<script setup lang="ts">
import type { SpeechProviderWithExtraOptions } from '@xsai-ext/shared-providers'
import type { UnElevenLabsOptions } from 'unspeech'

import {
  Callout,
  SpeechPlayground,
  SpeechProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { FieldRange } from '@proj-airi/ui'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const providerId = 'player2-speech'
const defaultModel = 'v1'
const speedRatio = ref<number>(1.0)
const speechStore = useSpeechStore()
const providersStore = useProvidersStore()

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
const hasPlayer2 = ref(true)
onMounted(async () => {
  const providerConfig = providersStore.getProviderConfig(providerId)
  const providerMetadata = providersStore.getProviderMetadata(providerId)
  if (await providerMetadata.validators.validateProviderConfig(providerConfig)) {
    await speechStore.loadVoicesForProvider(providerId)
  }
  else {
    console.error('Failed to validate provider config', providerConfig)
  }

  try {
    const baseUrl = (providerConfig.baseUrl as string | undefined) ?? ''
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
})

watch(speedRatio, async () => {
  const providerConfig = providersStore.getProviderConfig(providerId)
  providerConfig.speed = speedRatio.value
})
</script>

<template>
  <div v-if="!hasPlayer2" style="color: red; margin-bottom: 1rem;">
    <Callout theme="orange">
      <template #label>
        Player 2 is not running
      </template>
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
    </Callout>
  </div>
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
        :api-key-configured="true"
        default-text="Hello! This is a test of the Player 2 voice synthesis."
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
