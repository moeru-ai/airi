<script setup lang="ts">
import type { SpeechProvider } from '@xsai-ext/providers/utils'

import {
  SpeechPlaygroundOpenAICompatible,
  SpeechProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { FieldCombobox, FieldInput } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted } from 'vue'

const speechStore = useSpeechStore()
const providersStore = useProviderStore()
const providerStore = useProviderConfigStore()
const { configs: providers } = storeToRefs(providerStore)

const providerId = 'openrouter-audio-speech'
const defaultModel = 'openai/gpt-audio-mini'
const defaultVoice = 'alloy'

const model = computed({
  get: () => providers.value[providerId]?.model as string | undefined || defaultModel,
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].model = value
  },
})

const voice = computed({
  get: () => (providers.value[providerId]?.voice as string | undefined) || defaultVoice,
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].voice = value
  },
})

const providerModels = computed(() => providersStore.getModelsForProvider(providerId))
const isLoadingModels = computed(() => providersStore.isLoadingModels[providerId] || false)
const apiKeyConfigured = computed(() => !!providers.value[providerId]?.apiKey)

onMounted(async () => {
  providers.value[providerId] ??= {}
  providers.value[providerId].model ??= defaultModel
  providers.value[providerId].voice ??= defaultVoice
  await providersStore.loadModelsForConfiguredProviders()
  await providersStore.fetchModelsForProvider(providerId)
  await speechStore.loadVoicesForProvider(providerId)
})

async function handleGenerateSpeech(input: string, voiceId: string, _useSSML: boolean, modelId?: string) {
  const provider = await providersStore.getProviderInstance<SpeechProvider<string>>(providerId)
  if (!provider)
    throw new Error('Failed to initialize speech provider')

  const providerConfig = providerStore.getProviderConfig(providerId)
  const modelToUse = modelId || model.value || defaultModel

  return await speechStore.speech(
    provider,
    modelToUse,
    input,
    voiceId || voice.value || defaultVoice,
    providerConfig,
  )
}
</script>

<template>
  <SpeechProviderSettings :provider-id="providerId" :default-model="defaultModel">
    <template #voice-settings>
      <FieldInput
        v-model="model"
        label="Model"
        description="Any OpenRouter TTS model id, including Fish Audio (fish-audio/s2-pro)."
        placeholder="fish-audio/s2-pro"
      />
      <FieldCombobox
        v-model="model"
        label="Catalog"
        description="Optional catalog of audio-capable models. You can still type a custom id above."
        :options="providerModels.map(m => ({ value: m.id, label: m.name }))"
        :disabled="isLoadingModels || providerModels.length === 0"
        placeholder="Select a catalog model..."
      />
    </template>

    <template #playground>
      <SpeechPlaygroundOpenAICompatible
        v-model:model-value="model"
        v-model:voice="voice"
        :generate-speech="handleGenerateSpeech"
        :api-key-configured="apiKeyConfigured"
        default-text="Hello! This is a test of OpenRouter Speech."
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
