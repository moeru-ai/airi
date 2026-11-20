<script setup lang="ts">
import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import {
  SpeechPlayground,
  SpeechProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useProviderValidation } from '@proj-airi/stage-ui/composables/use-provider-validation'
import { VOICEBOX_SPEECH_PROVIDER_ID } from '@proj-airi/stage-ui/libs/providers/providers/voicebox'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { Alert, Callout, FieldCombobox, GhostButton } from '@proj-airi/ui'
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
const providersStore = useProviderStore()
const speechStore = useSpeechStore()
const providerStore = useProviderConfigStore()
const config = computed<Record<string, unknown> | undefined>(() => providerStore.getProviderConfig(VOICEBOX_SPEECH_PROVIDER_ID))

const model = computed({
  get: () => typeof config.value?.model === 'string' && config.value.model ? config.value.model : defaultModel,
  set: async (value: string) => {
    await providersStore.initializeProvider(VOICEBOX_SPEECH_PROVIDER_ID)
    await providerStore.setProviderModel(VOICEBOX_SPEECH_PROVIDER_ID, value)
  },
})

const language = computed({
  get: () => typeof config.value?.language === 'string' && config.value.language ? config.value.language : defaultLanguage,
  set: async (value: string) => {
    await providersStore.initializeProvider(VOICEBOX_SPEECH_PROVIDER_ID)
    await providerStore.patchProviderConfig(VOICEBOX_SPEECH_PROVIDER_ID, { language: value })
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

  const currentConfig = providerStore.getProviderConfig(VOICEBOX_SPEECH_PROVIDER_ID)
  return await speechStore.speech(
    provider,
    modelId || model.value,
    input,
    voiceId,
    {
      ...currentConfig,
      language: language.value,
    },
  )
}

onMounted(async () => {
  await providersStore.initializeProvider(VOICEBOX_SPEECH_PROVIDER_ID)

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
