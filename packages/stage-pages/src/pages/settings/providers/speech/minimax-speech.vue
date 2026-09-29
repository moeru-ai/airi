<script setup lang="ts">
import type { VoiceInfo } from '@proj-airi/stage-ui/stores/providers/provider'
import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import {
  SpeechPlayground,
  SpeechProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { watchDebounced } from '@vueuse/core'
import { cloneDeep } from 'es-toolkit'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

const providerId = 'minimax-speech'
const defaultModel = 'speech-2.8-hd'

// MiniMax takes synthesis parameters in its own `voice_setting` envelope. The
// provider definition maps speed/volume/pitch itself, so the page adds nothing.
const defaultVoiceSettings = {}

const speechStore = useSpeechStore()
const providersStore = useProviderStore()
const providerStore = useProviderConfigStore()
const { configs: providers } = storeToRefs(providerStore)

const apiKeyConfigured = computed(() => !!providers.value[providerId]?.apiKey)

// A stable empty list keeps the computed value stable when the provider has no
// voice catalog yet. A new array on each read causes extra UI updates.
const emptyVoices: VoiceInfo[] = []
Object.freeze(emptyVoices)

const availableVoices = computed(() => {
  return speechStore.availableVoices[providerId] ?? emptyVoices
})

async function handleGenerateSpeech(input: string, voiceId: string, _useSSML: boolean) {
  const provider = await providersStore.getProviderInstance(providerId) as SpeechProviderWithExtraOptions<string>
  if (!provider) {
    throw new Error('Failed to initialize speech provider')
  }

  const providerConfig = providerStore.getProviderConfig(providerId)

  const model = providerConfig.model as string | undefined || defaultModel

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

async function loadVoicesWhenConfigured() {
  const providerConfig = providerStore.getProviderConfig(providerId)
  // Clone nested reactive values before the synchronized action sends its arguments.
  const configSnapshot = cloneDeep(providerConfig)
  if ((await providersStore.validateProviderConfig(providerId, configSnapshot)).valid) {
    await speechStore.loadVoicesForProvider(providerId)
  }
  else {
    console.error('Failed to validate provider config', providerConfig)
  }
}

// The page must load the catalog on mount. A saved key does not change after a
// reload, so a watcher without `immediate` never asks for the voices and the
// selector stays empty.
watchDebounced([
  () => providers.value[providerId]?.apiKey,
  () => providers.value[providerId]?.baseUrl,
], loadVoicesWhenConfigured, {
  debounce: 500,
  immediate: true,
})
</script>

<template>
  <SpeechProviderSettings
    :provider-id="providerId"
    :default-model="defaultModel"
    :additional-settings="defaultVoiceSettings"
  >
    <template #playground>
      <SpeechPlayground
        :available-voices="availableVoices"
        :generate-speech="handleGenerateSpeech"
        :api-key-configured="apiKeyConfigured"
        default-text="Hello! This is a test of the MiniMax voice synthesis."
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
