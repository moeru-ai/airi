<script setup lang="ts">
import type { SpeechProvider } from '@xsai-ext/providers/utils'

import {
  SpeechPlayground,
  SpeechProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { Callout } from '@proj-airi/ui'
import { computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const providerId = 'chatterbox-turbo'
const defaultModel = 'chatterbox'

const speechStore = useSpeechStore()
const providersStore = useProvidersStore()

// Chatterbox servers do not require an API key; the local server is always reachable once configured.
const apiKeyConfigured = true

// Get available voices for the Chatterbox provider
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

  const providerConfig = providersStore.getProviderConfig(providerId)
  const model = providerConfig.model as string | undefined || defaultModel

  return await speechStore.speech(
    provider,
    model,
    input,
    voiceId,
    { ...providerConfig },
  )
}
</script>

<template>
  <Callout
    theme="violet"
    :label="t('settings.pages.providers.provider.chatterbox-turbo.callout_local_server_title')"
  >
    {{ t('settings.pages.providers.provider.chatterbox-turbo.callout_local_server') }}
  </Callout>

  <SpeechProviderSettings :provider-id="providerId" :default-model="defaultModel">
    <!-- Replace the default playground with our standalone component -->
    <template #playground>
      <SpeechPlayground
        :available-voices="availableVoices"
        :generate-speech="handleGenerateSpeech"
        :api-key-configured="apiKeyConfigured"
        :use-ssml="false"
        default-text="Hello! This is a test of Chatterbox Turbo speech synthesis."
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
