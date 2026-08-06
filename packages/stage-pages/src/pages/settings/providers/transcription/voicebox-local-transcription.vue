<script setup lang="ts">
import type { TranscriptionProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import {
  TranscriptionPlayground,
  TranscriptionProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useProviderValidation } from '@proj-airi/stage-ui/composables/use-provider-validation'
import { VOICEBOX_TRANSCRIPTION_PROVIDER_ID } from '@proj-airi/stage-ui/libs/providers/providers/voicebox'
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { Alert, Callout, FieldCombobox, GhostButton } from '@proj-airi/ui'
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
const providersStore = useProviderStore()
const providerStore = useProviderConfigStore()
const config = computed<Record<string, unknown> | undefined>(() => providerStore.getProviderConfig(VOICEBOX_TRANSCRIPTION_PROVIDER_ID))

const model = computed({
  get: () => typeof config.value?.model === 'string' && config.value.model ? config.value.model : defaultModel,
  set: async (value: string) => {
    await providersStore.initializeProvider(VOICEBOX_TRANSCRIPTION_PROVIDER_ID)
    await providerStore.setProviderModel(VOICEBOX_TRANSCRIPTION_PROVIDER_ID, value)
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
    { providerOptions: { language: typeof config.value?.language === 'string' ? config.value.language : defaultLanguage } },
  )
}

onMounted(async () => {
  await providersStore.initializeProvider(VOICEBOX_TRANSCRIPTION_PROVIDER_ID)
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
      <Alert v-if="!isValid && isValidating === 0 && validationMessage" tone="danger">
        <template #title>
          {{ validationMessage }}
        </template>
        <template #actions>
          <GhostButton size="sm" @click="forceValid">
            {{ t('settings.pages.providers.common.continueAnyway') }}
          </GhostButton>
        </template>
      </Alert>
      <Alert v-if="isValid && isValidating === 0" tone="success">
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
