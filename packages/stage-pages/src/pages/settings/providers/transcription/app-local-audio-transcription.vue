<script setup lang="ts">
import type { RemovableRef } from '@vueuse/core'
import type { TranscriptionProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import {
  TranscriptionPlayground,
  TranscriptionProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import {
  FieldInput,
  FieldSelect,
} from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted } from 'vue'

const providerId = 'app-local-audio-transcription'
const defaultModel = 'whisper-1'

const hearingStore = useHearingStore()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore) as { providers: RemovableRef<Record<string, any>> }
providersStore.initializeProvider(providerId)

const model = computed({
  get: () => providers.value[providerId]?.model || defaultModel,
  set: (value) => {
    providers.value[providerId].model = value
  },
})

const providerModels = computed(() => providersStore.getModelsForProvider(providerId))
const isLoadingModels = computed(() => providersStore.isLoadingModels[providerId] || false)
const baseUrl = computed(() => (providers.value[providerId]?.baseUrl as string | undefined)?.trim() || '')
const isProviderConfigured = computed(() => !!baseUrl.value)

async function handleGenerateTranscription(file: File) {
  if (!baseUrl.value) {
    throw new Error('Base URL is required. Configure your local endpoint in Advanced settings first.')
  }

  const provider = await providersStore.getProviderInstance<TranscriptionProviderWithExtraOptions<string, any>>(providerId)
  if (!provider)
    throw new Error('Failed to initialize transcription provider')

  const providerConfig = providersStore.getProviderConfig(providerId)
  const modelToUse = providerConfig.model as string | undefined || model.value || defaultModel

  return hearingStore.transcription(
    providerId,
    provider,
    modelToUse,
    file,
    'json',
  )
}

onMounted(async () => {
  if (baseUrl.value) {
    await providersStore.fetchModelsForProvider(providerId)
  }
})
</script>

<template>
  <TranscriptionProviderSettings
    :provider-id="providerId"
    :default-model="defaultModel"
    placeholder="Not required for local provider"
  >
    <template #basic-settings>
      <FieldSelect
        v-if="providerModels.length > 0"
        v-model="model"
        label="Model"
        description="Select the transcription model to use"
        :options="providerModels.map(m => ({ value: m.id, label: m.name }))"
        :disabled="isLoadingModels"
        placeholder="Select a model..."
      />
      <FieldInput
        v-else
        v-model="model"
        label="Model"
        description="Enter the local transcription model name"
        placeholder="whisper-1"
      />
    </template>

    <template #playground>
      <TranscriptionPlayground
        :generate-transcription="handleGenerateTranscription"
        :api-key-configured="isProviderConfigured"
      />
    </template>
  </TranscriptionProviderSettings>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
