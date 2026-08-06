<script setup lang="ts">
import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import {
  Alert,
  SpeechPlayground,
  SpeechProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useProviderValidation } from '@proj-airi/stage-ui/composables/use-provider-validation'
import { VOICEBOX_SPEECH_PROVIDER_ID } from '@proj-airi/stage-ui/libs/providers/providers/voicebox'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { Callout, FieldCombobox } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

interface VoiceboxSpeechConfig {
  baseUrl?: string
  language?: string
  model?: string
}

const defaultModel = 'qwen-tts-1.7B'
const defaultLanguage = 'zh'

const { t } = useI18n()
const providersStore = useProvidersStore()
const speechStore = useSpeechStore()
const { providers } = storeToRefs(providersStore)

function ensureConfig() {
  providers.value[VOICEBOX_SPEECH_PROVIDER_ID] ??= {}
  return providers.value[VOICEBOX_SPEECH_PROVIDER_ID] as VoiceboxSpeechConfig
}

const model = computed({
  get: () => (providers.value[VOICEBOX_SPEECH_PROVIDER_ID] as VoiceboxSpeechConfig | undefined)?.model || defaultModel,
  set: (value: string) => {
    ensureConfig().model = value
  },
})

const language = computed({
  get: () => (providers.value[VOICEBOX_SPEECH_PROVIDER_ID] as VoiceboxSpeechConfig | undefined)?.language || defaultLanguage,
  set: (value: string) => {
    ensureConfig().language = value
  },
})

const modelOptions = computed(() => {
  const models = providersStore.getModelsForProvider(VOICEBOX_SPEECH_PROVIDER_ID)
  const availableModels = models.length > 0
    ? models
    : [{ id: defaultModel, name: 'Qwen TTS 1.7B' }]

  return availableModels.map(item => ({ label: item.name, value: item.id }))
})

const languageOptions = computed(() => [
  { label: t('settings.pages.providers.provider.voicebox-local.fields.language.options.zh'), value: 'zh' },
  { label: t('settings.pages.providers.provider.voicebox-local.fields.language.options.en'), value: 'en' },
  { label: t('settings.pages.providers.provider.voicebox-local.fields.language.options.ja'), value: 'ja' },
  { label: t('settings.pages.providers.provider.voicebox-local.fields.language.options.ko'), value: 'ko' },
])

const availableVoices = computed(() => speechStore.availableVoices[VOICEBOX_SPEECH_PROVIDER_ID] || [])
const voicesLoading = computed(() => speechStore.isLoadingSpeechProviderVoices)

async function handleGenerateSpeech(input: string, voiceId: string, _useSSML: boolean, modelId?: string) {
  const provider = await providersStore.getProviderInstance<SpeechProviderWithExtraOptions<string, VoiceboxSpeechConfig>>(VOICEBOX_SPEECH_PROVIDER_ID)
  if (!provider)
    throw new Error('Failed to initialize the local Voicebox speech provider.')

  const config = providersStore.getProviderConfig(VOICEBOX_SPEECH_PROVIDER_ID)
  return await speechStore.speech(
    provider,
    modelId || model.value,
    input,
    voiceId,
    {
      ...config,
      language: language.value,
    },
  )
}

onMounted(async () => {
  const config = ensureConfig()
  config.model ??= defaultModel
  config.language ??= defaultLanguage

  await Promise.all([
    providersStore.fetchModelsForProvider(VOICEBOX_SPEECH_PROVIDER_ID),
    speechStore.loadVoicesForProvider(VOICEBOX_SPEECH_PROVIDER_ID),
  ])
})

const {
  isValidating,
  isValid,
  validationMessage,
  forceValid,
} = useProviderValidation(VOICEBOX_SPEECH_PROVIDER_ID)
</script>

<template>
  <SpeechProviderSettings
    :provider-id="VOICEBOX_SPEECH_PROVIDER_ID"
    :default-model="defaultModel"
  >
    <template #basic-settings>
      <Callout :label="t('settings.pages.providers.provider.voicebox-local-speech.notice.title')">
        {{ t('settings.pages.providers.provider.voicebox-local-speech.notice.description') }}
      </Callout>
    </template>

    <template #voice-settings>
      <FieldCombobox
        v-model="model"
        :label="t('settings.pages.providers.provider.voicebox-local.fields.model.label')"
        :description="t('settings.pages.providers.provider.voicebox-local.fields.model.description')"
        :options="modelOptions"
        :disabled="providersStore.isLoadingModels[VOICEBOX_SPEECH_PROVIDER_ID]"
        layout="vertical"
      />
      <FieldCombobox
        v-model="language"
        :label="t('settings.pages.providers.provider.voicebox-local.fields.language.label')"
        :description="t('settings.pages.providers.provider.voicebox-local.fields.language.description')"
        :options="languageOptions"
        layout="vertical"
      />
    </template>

    <template #playground>
      <SpeechPlayground
        :available-voices="availableVoices"
        :generate-speech="handleGenerateSpeech"
        :api-key-configured="true"
        :voices-loading="voicesLoading"
        :default-text="t('settings.pages.providers.provider.voicebox-local-speech.playground.default-text')"
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
  </SpeechProviderSettings>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.providers.provider.voicebox-local-speech.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.providers.provider.voicebox-local-speech.description
  stageTransition:
    name: slide
</route>
