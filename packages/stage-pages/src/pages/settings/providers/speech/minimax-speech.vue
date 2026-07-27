<script setup lang="ts">
import type { SpeechProvider } from '@xsai-ext/providers/utils'

import {
  SpeechPlayground,
  SpeechProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { FieldCombobox } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

const providerId = 'minimax-speech'
const defaultModel = 'speech-2.8-hd'

const { t } = useI18n()
const speechStore = useSpeechStore()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore)

const model = computed({
  get: () => providers.value[providerId]?.model as string | undefined || defaultModel,
  set: (value) => {
    providers.value[providerId] ??= {}
    providers.value[providerId].model = value
  },
})

const modelOptions = computed(() => {
  return providersStore.getModelsForProvider(providerId).map(model => ({
    value: model.id,
    label: model.name,
  }))
})

const availableVoices = computed(() => speechStore.availableVoices[providerId] || [])
const apiKeyConfigured = computed(() => !!providers.value[providerId]?.apiKey)

onMounted(async () => {
  providers.value[providerId] ??= {}
  providers.value[providerId].model ??= defaultModel

  await providersStore.fetchModelsForProvider(providerId)
  await speechStore.loadVoicesForProvider(providerId)
})

async function handleGenerateSpeech(input: string, voiceId: string, _useSSML: boolean) {
  const provider = await providersStore.getProviderInstance<SpeechProvider<string>>(providerId)
  if (!provider)
    throw new Error(t('settings.pages.providers.provider.minimax-speech.errors.provider-initialization-failed'))

  return await speechStore.speech(
    provider,
    model.value,
    input,
    voiceId,
    providersStore.getProviderConfig(providerId),
  )
}
</script>

<template>
  <SpeechProviderSettings
    :provider-id="providerId"
    :default-model="defaultModel"
  >
    <template #voice-settings>
      <FieldCombobox
        v-model="model"
        :label="t('settings.pages.providers.provider.minimax-speech.fields.field.model.label')"
        :description="t('settings.pages.providers.provider.minimax-speech.fields.field.model.description')"
        :options="modelOptions"
        :placeholder="t('settings.pages.providers.provider.minimax-speech.fields.field.model.placeholder')"
      />
    </template>

    <template #playground>
      <SpeechPlayground
        :available-voices="availableVoices"
        :generate-speech="handleGenerateSpeech"
        :api-key-configured="apiKeyConfigured"
        :default-text="t('settings.pages.providers.provider.minimax-speech.playground.default-text')"
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
