<script setup lang="ts">
import type { TranscriptionProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import {
  Alert,
  TranscriptionPlayground,
  TranscriptionProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useProviderValidation } from '@proj-airi/stage-ui/composables/use-provider-validation'
import { VOICEBOX_TRANSCRIPTION_PROVIDER_ID } from '@proj-airi/stage-ui/libs/providers/providers/voicebox'
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { Callout, FieldCombobox } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

interface VoiceboxTranscriptionConfig {
  baseUrl?: string
  language?: string
  model?: string
}

const defaultModel = 'base'
const defaultLanguage = 'zh'

const { t } = useI18n()
const hearingStore = useHearingStore()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore)

function ensureConfig() {
  providers.value[VOICEBOX_TRANSCRIPTION_PROVIDER_ID] ??= {}
  return providers.value[VOICEBOX_TRANSCRIPTION_PROVIDER_ID] as VoiceboxTranscriptionConfig
}

const model = computed({
  get: () => (providers.value[VOICEBOX_TRANSCRIPTION_PROVIDER_ID] as VoiceboxTranscriptionConfig | undefined)?.model || defaultModel,
  set: (value: string) => {
    ensureConfig().model = value
  },
})

const modelOptions = computed(() => {
  const models = providersStore.getModelsForProvider(VOICEBOX_TRANSCRIPTION_PROVIDER_ID)
  const availableModels = models.length > 0
    ? models
    : [{ id: defaultModel, name: 'Whisper Base' }]

  return availableModels.map(item => ({ label: item.name, value: item.id }))
})

async function handleGenerateTranscription(file: File) {
  const provider = await providersStore.getProviderInstance<TranscriptionProviderWithExtraOptions<string, VoiceboxTranscriptionConfig>>(VOICEBOX_TRANSCRIPTION_PROVIDER_ID)
  if (!provider)
    throw new Error('Failed to initialize the local Voicebox transcription provider.')

  return await hearingStore.transcription(
    VOICEBOX_TRANSCRIPTION_PROVIDER_ID,
    provider,
    model.value,
    file,
    'json',
    { providerOptions: { language: ensureConfig().language || defaultLanguage } },
  )
}

onMounted(async () => {
  const config = ensureConfig()
  config.model ??= defaultModel
  config.language ??= defaultLanguage
  await providersStore.fetchModelsForProvider(VOICEBOX_TRANSCRIPTION_PROVIDER_ID)
})

const {
  isValidating,
  isValid,
  validationMessage,
  forceValid,
} = useProviderValidation(VOICEBOX_TRANSCRIPTION_PROVIDER_ID)
</script>

<template>
  <TranscriptionProviderSettings
    :provider-id="VOICEBOX_TRANSCRIPTION_PROVIDER_ID"
    :default-model="defaultModel"
  >
    <template #basic-settings>
      <Callout :label="t('settings.pages.providers.provider.voicebox-local-transcription.notice.title')">
        {{ t('settings.pages.providers.provider.voicebox-local-transcription.notice.description') }}
      </Callout>
      <FieldCombobox
        v-model="model"
        :label="t('settings.pages.providers.provider.voicebox-local.fields.model.label')"
        :description="t('settings.pages.providers.provider.voicebox-local.fields.model.description')"
        :options="modelOptions"
        :disabled="providersStore.isLoadingModels[VOICEBOX_TRANSCRIPTION_PROVIDER_ID]"
        layout="vertical"
      />
    </template>

    <template #playground>
      <TranscriptionPlayground
        :generate-transcription="handleGenerateTranscription"
        :api-key-configured="true"
      />
    </template>

    <template #advanced-settings>
      <Alert v-if="!isValid && isValidating === 0 && validationMessage" type="error">
        <template #title>
          {{ validationMessage }}
        </template>
        <template #content>
          <button type="button" class="text-xs underline" @click="forceValid">
            {{ t('settings.pages.providers.common.continueAnyway') }}
          </button>
        </template>
      </Alert>
      <Alert v-if="isValid && isValidating === 0" type="success">
        <template #title>
          {{ t('settings.dialogs.onboarding.validationSuccess') }}
        </template>
      </Alert>
    </template>
  </TranscriptionProviderSettings>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.providers.provider.voicebox-local-transcription.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.providers.provider.voicebox-local-transcription.description
  stageTransition:
    name: slide
</route>
