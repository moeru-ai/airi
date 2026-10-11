<script setup lang="ts">
import type { TranscriptionProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import {
  TranscriptionPlayground,
  TranscriptionProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { FieldCombobox } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const hearingStore = useHearingStore()
const providersStore = useProviderStore()
const providerConfigStore = useProviderConfigStore()
const { configs: providers } = storeToRefs(providerConfigStore)
const { t } = useI18n()
const providerId = 'openrouter-audio-transcription'

const apiKeyConfigured = computed(() => Boolean(providers.value[providerId]?.apiKey))
const providerModels = computed(() => providersStore.getModelsForProvider(providerId))
const isLoadingModels = computed(() => providersStore.isLoadingModels[providerId] || false)
const selectedModel = computed(() => {
  const model = providers.value[providerId]?.model
  return typeof model === 'string' ? model : ''
})

watch(() => providers.value[providerId]?.apiKey, async (apiKey) => {
  if (typeof apiKey !== 'string' || !apiKey.trim())
    return

  const catalog = await providersStore.fetchModelsForProvider(providerId)
  const defaultModel = catalog.defaultModel ?? catalog.models?.[0]?.id
  if (!selectedModel.value && defaultModel)
    await providerConfigStore.setProviderModelIfUnset(providerId, defaultModel)
}, { immediate: true })

async function handleModelChange(model: string | undefined) {
  if (!model)
    return

  await providerConfigStore.setProviderModel(providerId, model)
}

async function handleGenerateTranscription(file: File) {
  const model = selectedModel.value
  if (!model)
    throw new Error('Select a model in OpenRouter settings before testing.')

  const provider = await providersStore.getProviderInstance<TranscriptionProviderWithExtraOptions<string, Record<string, unknown>>>(providerId)
  if (!provider)
    throw new Error('Failed to initialize transcription provider')

  return await hearingStore.transcription(providerId, provider, model, file, 'json')
}
</script>

<template>
  <TranscriptionProviderSettings :provider-id="providerId">
    <template #basic-settings>
      <FieldCombobox
        :model-value="selectedModel"
        :label="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.model_id_label')"
        :options="providerModels.map(model => ({ value: model.id, label: model.name || model.id }))"
        :disabled="isLoadingModels || providerModels.length === 0"
        @update:model-value="handleModelChange"
      />
    </template>
    <template #playground>
      <TranscriptionPlayground
        :generate-transcription="handleGenerateTranscription"
        :api-key-configured="apiKeyConfigured"
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
