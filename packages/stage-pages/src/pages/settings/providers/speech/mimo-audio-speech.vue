<script setup lang="ts">
import type { SpeechProvider } from '@xsai-ext/providers/utils'

import { SpeechPlayground, SpeechProviderSettings } from '@proj-airi/stage-ui/components'
import { useProviderValidation } from '@proj-airi/stage-ui/composables/use-provider-validation'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { Alert, Button, FieldCombobox, FieldTextArea } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

interface MimoSpeechProviderConfig {
  apiKey?: string
  baseUrl?: string
  format?: string
  model?: string
  stylePrompt?: string
  voice?: string
  voiceSample?: string
}

const speechStore = useSpeechStore()
const providersStore = useProviderStore()
const providerStore = useProviderConfigStore()
const { configs: providers } = storeToRefs(providerStore)
const { t } = useI18n()

const defaultVoiceSettings = {
  speed: 1.0,
}

const providerId = 'mimo-audio-speech'
const defaultModel = 'mimo-v2.5-tts'
const defaultVoice = 'mimo_default'

const config = computed(() => providers.value[providerId] as MimoSpeechProviderConfig | undefined)

function ensureProviderConfig(): MimoSpeechProviderConfig {
  if (!providers.value[providerId]) {
    providers.value[providerId] = {}
  }

  return providers.value[providerId] as MimoSpeechProviderConfig
}

const providerModels = computed(() => providersStore.getModelsForProvider(providerId))
const modelOptions = computed(() => {
  const fallbackOptions = [
    { id: 'mimo-v2.5-tts', name: 'MiMo v2.5 TTS' },
    { id: 'mimo-v2.5-tts-voicedesign', name: 'MiMo v2.5 TTS Voice Design' },
    { id: 'mimo-v2.5-tts-voiceclone', name: 'MiMo v2.5 TTS Voice Clone' },
  ]

  return (providerModels.value.length > 0 ? providerModels.value : fallbackOptions).map(model => ({
    value: model.id,
    label: model.name,
  }))
})

const model = computed({
  get: () => config.value?.model || defaultModel,
  set: (value) => {
    ensureProviderConfig().model = value
  },
})

const availableVoices = computed(() => speechStore.availableVoices[providerId] || [])

const isVoiceDesignModel = computed(() => model.value === 'mimo-v2.5-tts-voicedesign')
const isVoiceCloneModel = computed(() => model.value === 'mimo-v2.5-tts-voiceclone')
const stylePromptLabel = computed(() => {
  if (isVoiceCloneModel.value)
    return 'Style prompt (optional)'
  if (isVoiceDesignModel.value)
    return 'Voice design prompt'
  return 'Style prompt'
})

const stylePromptDescription = computed(() => {
  if (isVoiceCloneModel.value) {
    return 'Optional natural-language control sent as the user message. Leave it empty for pure voice cloning.'
  }

  if (isVoiceDesignModel.value) {
    return 'Natural-language control sent as the user message. MiMo voice design requires this prompt and does not use a preset voice.'
  }

  return 'Natural-language control sent as the user message. You can leave it empty for a neutral delivery.'
})

const stylePrompt = computed({
  get: () => config.value?.stylePrompt || '',
  set: (value) => {
    ensureProviderConfig().stylePrompt = value
  },
})

const voiceSample = computed({
  get: () => config.value?.voiceSample || '',
  set: (value) => {
    ensureProviderConfig().voiceSample = value
  },
})

const apiKeyConfigured = computed(() => !!providers.value[providerId]?.apiKey)

onMounted(async () => {
  ensureProviderConfig()

  if (!config.value?.model) {
    model.value = defaultModel
  }

  await providersStore.loadModelsForConfiguredProviders()
  await providersStore.fetchModelsForProvider(providerId)
  await speechStore.loadVoicesForProvider(providerId)
})

async function handleGenerateSpeech(input: string, voiceId: string, _useSSML: boolean, modelId?: string) {
  const provider = await providersStore.getProviderInstance<SpeechProvider<string>>(providerId)
  if (!provider) {
    throw new Error('Failed to initialize speech provider')
  }

  const providerConfig = providerStore.getProviderConfig(providerId)
  const modelToUse = modelId || model.value || defaultModel
  const requestConfig = {
    ...providerConfig,
    ...defaultVoiceSettings,
    stylePrompt: stylePrompt.value,
    voiceSample: voiceSample.value,
  }

  if (modelToUse === 'mimo-v2.5-tts-voiceclone' && !voiceSample.value.trim()) {
    throw new Error('Voice clone model requires a base64 audio sample in data URI format.')
  }

  const voiceToUse = modelToUse === 'mimo-v2.5-tts-voiceclone'
    ? voiceSample.value.trim()
    : voiceId || (config.value?.voice || defaultVoice)

  return await speechStore.speech(
    provider,
    modelToUse,
    input,
    voiceToUse,
    requestConfig,
  )
}

const {
  isValidating,
  isValid,
  validationMessage,
  forceValid,
} = useProviderValidation(providerId)
</script>

<template>
  <SpeechProviderSettings
    :provider-id="providerId"
    :default-model="defaultModel"
    :additional-settings="defaultVoiceSettings"
  >
    <template #voice-settings>
      <FieldCombobox
        v-model="model"
        label="Model"
        description="Select the MiMo TTS model to use for speech generation"
        :options="modelOptions"
        placeholder="Select a MiMo model..."
      />
      <FieldTextArea
        v-model="stylePrompt"
        :label="stylePromptLabel"
        :description="stylePromptDescription"
        placeholder="Describe the tone, pacing, emotion, and delivery style..."
        :required="!isVoiceCloneModel"
      />
      <FieldTextArea
        v-if="isVoiceCloneModel"
        v-model="voiceSample"
        label="Voice sample (data URI)"
        description="Paste the base64 voice sample as data:{MIME_TYPE};base64,$BASE64_AUDIO. MiMo supports mp3 and wav samples up to 10 MB."
        placeholder="data:audio/wav;base64,UklGRpyG..."
        :required="isVoiceCloneModel"
      />
    </template>

    <template #playground>
      <SpeechPlayground
        :available-voices="availableVoices"
        :generate-speech="handleGenerateSpeech"
        :api-key-configured="apiKeyConfigured"
        :voices-loading="speechStore.voiceCatalogStatus[providerId]?.loading ?? false"
        default-text="Hello! This is a test of the Xiaomi MiMo Speech."
      />
    </template>

    <template #advanced-settings>
      <Alert tone="info" :title="t('settings.pages.providers.provider.mimo.model-behavior.title')">
        <ul>
          <li>
            <i18n-t keypath="settings.pages.providers.provider.mimo.model-behavior.preset" scope="global">
              <template #model>
                <code>mimo-v2.5-tts</code>
              </template>
            </i18n-t>
          </li>
          <li>
            <i18n-t keypath="settings.pages.providers.provider.mimo.model-behavior.voice-design" scope="global">
              <template #model>
                <code>mimo-v2.5-tts-voicedesign</code>
              </template>
              <template #field>
                <code>audio.voice</code>
              </template>
            </i18n-t>
          </li>
          <li>
            <i18n-t keypath="settings.pages.providers.provider.mimo.model-behavior.voice-clone" scope="global">
              <template #model>
                <code>mimo-v2.5-tts-voiceclone</code>
              </template>
            </i18n-t>
          </li>
        </ul>
      </Alert>
      <Alert v-if="!isValid && isValidating === 0 && validationMessage" tone="danger" :title="t('settings.dialogs.onboarding.validationFailed')">
        <div :class="['whitespace-pre-wrap break-all']">
          {{ validationMessage }}
        </div>
        <template #actions>
          <Button size="sm" color="red" @click="forceValid">
            {{ t('settings.pages.providers.common.continueAnyway') }}
          </Button>
        </template>
      </Alert>
      <Alert v-if="isValid && isValidating === 0" tone="success" :title="t('settings.dialogs.onboarding.validationSuccess')" />
    </template>
  </SpeechProviderSettings>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
