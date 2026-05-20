<script setup lang="ts">
import type { SpeechProvider } from '@xsai-ext/providers/utils'

import {
  SpeechPlaygroundOpenAICompatible,
  SpeechProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import {
  FieldInput,
  FieldRange,
  FieldSelect,
} from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const providerId = 'browser-local-audio-speech'
const defaultModel = 'tts-1'
const defaultSpeed = 1.0

const speechStore = useSpeechStore()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore)
const { t } = useI18n()
providersStore.initializeProvider(providerId)

const speed = ref<number>(
  (providers.value[providerId] as any)?.voiceSettings?.speed
  || (providers.value[providerId] as any)?.speed
  || defaultSpeed,
)

const model = computed({
  get: () => providers.value[providerId]?.model as string | undefined || defaultModel,
  set: (value) => {
    providers.value[providerId].model = value
  },
})

const voice = computed({
  get: () => providers.value[providerId]?.voice || 'alloy',
  set: (value) => {
    providers.value[providerId].voice = value
  },
})

const providerModels = computed(() => providersStore.getModelsForProvider(providerId))
const isLoadingModels = computed(() => providersStore.isLoadingModels[providerId] || false)
const baseUrl = computed(() => (providers.value[providerId]?.baseUrl as string | undefined)?.trim() || '')
const isProviderConfigured = computed(() => !!baseUrl.value)

async function handleGenerateSpeech(input: string, voiceId: string, _useSSML: boolean, modelId?: string) {
  if (!baseUrl.value) {
    throw new Error('Base URL is required. Configure your local endpoint in Advanced settings first.')
  }

  const provider = await providersStore.getProviderInstance<SpeechProvider<string>>(providerId)
  if (!provider)
    throw new Error('Failed to initialize speech provider')

  const providerConfig = providersStore.getProviderConfig(providerId)
  const modelToUse = modelId || model.value || defaultModel

  return speechStore.speech(
    provider,
    modelToUse,
    input,
    voiceId || (voice.value as string),
    {
      ...providerConfig,
      speed: speed.value,
    },
  )
}

onMounted(async () => {
  if (baseUrl.value) {
    await providersStore.fetchModelsForProvider(providerId)
  }
})

watch(speed, () => {
  providers.value[providerId].speed = speed.value
})
</script>

<template>
  <SpeechProviderSettings
    :provider-id="providerId"
    :default-model="defaultModel"
    :additional-settings="{ speed: defaultSpeed }"
    placeholder="Not required for local provider"
  >
    <template #voice-settings>
      <FieldSelect
        v-if="providerModels.length > 0"
        v-model="model"
        label="Model"
        description="Select the speech model to use"
        :options="providerModels.map(m => ({ value: m.id, label: m.name }))"
        :disabled="isLoadingModels"
        placeholder="Select a model..."
      />
      <FieldInput
        v-else
        v-model="model"
        label="Model"
        description="Enter the local speech model name"
        placeholder="tts-1"
      />
      <FieldRange
        v-model="speed"
        :label="t('settings.pages.providers.provider.common.fields.field.speed.label')"
        :description="t('settings.pages.providers.provider.common.fields.field.speed.description')"
        :min="0.5"
        :max="2.0"
        :step="0.01"
      />
    </template>

    <template #playground>
      <SpeechPlaygroundOpenAICompatible
        v-model:model-value="model"
        v-model:voice="voice as any"
        :generate-speech="handleGenerateSpeech"
        :api-key-configured="isProviderConfigured"
        default-text="Hello! This is a test of the local speech provider."
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
