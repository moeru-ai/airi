<script setup lang="ts">
import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import {
  SpeechPlayground,
  SpeechProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { FieldCombobox, FieldInput, FieldRange, FieldSelect } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const providerId = 'minimax-speech'

interface MinimaxSpeechProviderConfig {
  apiKey?: string
  baseUrl?: string
  model?: string
  voice?: string
  speed?: number
  volume?: number
  pitch?: number
  sampleRate?: number
  bitrate?: number
  channel?: number
  languageBoost?: string
}

const { t } = useI18n()

const speechStore = useSpeechStore()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore)
const providerMetadata = computed(() => providersStore.getProviderMetadata(providerId))
const defaultProviderConfig = computed(() => providerMetadata.value.defaultOptions?.() as MinimaxSpeechProviderConfig)
const defaultVoiceSettings = computed(() => ({
  speed: defaultProviderConfig.value.speed ?? 1,
  volume: defaultProviderConfig.value.volume ?? 1,
  pitch: defaultProviderConfig.value.pitch ?? 0,
  sampleRate: defaultProviderConfig.value.sampleRate ?? 32000,
  bitrate: defaultProviderConfig.value.bitrate ?? 128000,
  channel: defaultProviderConfig.value.channel ?? 1,
  languageBoost: defaultProviderConfig.value.languageBoost ?? 'auto',
}))
const defaultModel = computed(() => defaultProviderConfig.value.model ?? 'speech-2.8-hd')
const providerConfig = computed(() => (providers.value[providerId] ?? {}) as MinimaxSpeechProviderConfig)
const normalizedProviderConfig = computed<MinimaxSpeechProviderConfig>(() => ({
  ...defaultProviderConfig.value,
  ...providerConfig.value,
}))
type MinimaxNumberSettingKey
  = 'speed'
    | 'volume'
    | 'pitch'
    | 'sampleRate'
    | 'bitrate'
    | 'channel'

function ensureProviderConfig() {
  providers.value[providerId] ??= {}
  return providers.value[providerId] as MinimaxSpeechProviderConfig
}

function createNumberField(key: MinimaxNumberSettingKey) {
  return computed({
    get: () => normalizedProviderConfig.value[key] as number,
    set: (value: number) => {
      ensureProviderConfig()[key] = value
    },
  })
}

const apiKeyConfigured = computed(() => !!providers.value[providerId]?.apiKey)
const model = computed({
  get: () => normalizedProviderConfig.value.model ?? defaultModel.value,
  set: (value) => {
    ensureProviderConfig().model = value
  },
})

const speed = createNumberField('speed')
const volume = createNumberField('volume')
const pitch = createNumberField('pitch')
const sampleRate = createNumberField('sampleRate')
const bitrate = createNumberField('bitrate')
const channel = createNumberField('channel')

const languageBoost = computed({
  get: () => normalizedProviderConfig.value.languageBoost ?? defaultProviderConfig.value.languageBoost ?? 'auto',
  set: (value) => {
    ensureProviderConfig().languageBoost = value
  },
})

const availableVoices = computed(() => {
  return speechStore.availableVoices[providerId] || []
})

const providerModels = computed(() => {
  return providersStore.getModelsForProvider(providerId)
})

const isLoadingModels = computed(() => {
  return providersStore.isLoadingModels[providerId] || false
})

onMounted(async () => {
  providersStore.initializeProvider(providerId)
  await providersStore.fetchModelsForProvider(providerId)
})

async function handleGenerateSpeech(input: string, voiceId: string, _useSSML: boolean) {
  const provider = await providersStore.getProviderInstance(providerId) as SpeechProviderWithExtraOptions<string>
  if (!provider) {
    throw new Error('Failed to initialize speech provider')
  }

  const providerConfig = normalizedProviderConfig.value
  const model = providerConfig.model || defaultModel.value

  return await speechStore.speech(
    provider,
    model,
    input,
    voiceId,
    providerConfig,
  )
}

watch(() => providers.value[providerId], async (providerConfig) => {
  if (!providerConfig) {
    return
  }

  if ((await providerMetadata.value.validators.validateProviderConfig(providerConfig)).valid) {
    await speechStore.loadVoicesForProvider(providerId)
  }
  else {
    console.error('Failed to validate provider config', providerConfig)
  }
}, {
  immediate: true,
})
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
        description="Select the MiniMax TTS model to use for speech generation."
        :options="providerModels.map(item => ({ value: item.id, label: item.name }))"
        :disabled="isLoadingModels || providerModels.length === 0"
        placeholder="Select a model..."
      />
      <FieldRange
        v-model="speed"
        :label="t('settings.pages.providers.provider.common.fields.field.speed.label')"
        :description="t('settings.pages.providers.provider.common.fields.field.speed.description')"
        :min="0.5"
        :max="2"
        :step="0.01"
      />
      <FieldRange
        v-model="pitch"
        :label="t('settings.pages.providers.provider.common.fields.field.pitch.label')"
        description="Adjust the MiniMax pitch value sent in voice settings."
        :min="-12"
        :max="12"
        :step="1"
      />
      <FieldRange
        v-model="volume"
        :label="t('settings.pages.providers.provider.common.fields.field.volume.label')"
        :description="t('settings.pages.providers.provider.common.fields.field.volume.description')"
        :min="0"
        :max="10"
        :step="0.1"
      />
    </template>

    <template #advanced-settings>
      <FieldSelect
        v-model="languageBoost"
        label="Language Boost"
        description="Hint the target language or dialect for MiniMax speech synthesis."
        :options="[
          { value: 'auto', label: 'Auto' },
          { value: 'Chinese', label: 'Chinese' },
          { value: 'Chinese,Yue', label: 'Chinese (Yue)' },
          { value: 'Arabic', label: 'Arabic' },
          { value: 'English', label: 'English' },
          { value: 'Russian', label: 'Russian' },
          { value: 'Spanish', label: 'Spanish' },
          { value: 'French', label: 'French' },
          { value: 'Portuguese', label: 'Portuguese' },
          { value: 'German', label: 'German' },
          { value: 'Turkish', label: 'Turkish' },
          { value: 'Dutch', label: 'Dutch' },
          { value: 'Ukrainian', label: 'Ukrainian' },
          { value: 'Vietnamese', label: 'Vietnamese' },
          { value: 'Indonesian', label: 'Indonesian' },
          { value: 'Japanese', label: 'Japanese' },
          { value: 'Italian', label: 'Italian' },
          { value: 'Korean', label: 'Korean' },
          { value: 'Thai', label: 'Thai' },
          { value: 'Polish', label: 'Polish' },
          { value: 'Romanian', label: 'Romanian' },
          { value: 'Greek', label: 'Greek' },
          { value: 'Czech', label: 'Czech' },
          { value: 'Finnish', label: 'Finnish' },
          { value: 'Hindi', label: 'Hindi' },
          { value: 'Bulgarian', label: 'Bulgarian' },
          { value: 'Danish', label: 'Danish' },
          { value: 'Hebrew', label: 'Hebrew' },
          { value: 'Malay', label: 'Malay' },
          { value: 'Persian', label: 'Persian' },
          { value: 'Slovak', label: 'Slovak' },
          { value: 'Swedish', label: 'Swedish' },
          { value: 'Croatian', label: 'Croatian' },
          { value: 'Filipino', label: 'Filipino' },
          { value: 'Hungarian', label: 'Hungarian' },
          { value: 'Norwegian', label: 'Norwegian' },
          { value: 'Slovenian', label: 'Slovenian' },
          { value: 'Catalan', label: 'Catalan' },
          { value: 'Nynorsk', label: 'Nynorsk' },
          { value: 'Tamil', label: 'Tamil' },
          { value: 'Afrikaans', label: 'Afrikaans' },
        ]"
        placeholder="Select a language hint..."
      />
      <FieldInput
        v-model="sampleRate"
        label="Sample Rate"
        description="MiniMax `audio_setting.sample_rate` value for the generated stream."
        type="number"
        placeholder="32000"
      />
      <FieldInput
        v-model="bitrate"
        label="Bitrate"
        description="MiniMax `audio_setting.bitrate` value in bits per second."
        type="number"
        placeholder="128000"
      />
      <FieldSelect
        v-model="channel"
        label="Channel"
        description="MiniMax `audio_setting.channel` value for mono or stereo output."
        :options="[
          { value: 1, label: 'Mono (1)' },
          { value: 2, label: 'Stereo (2)' },
        ]"
      />
    </template>

    <template #playground>
      <SpeechPlayground
        :available-voices="availableVoices"
        :generate-speech="handleGenerateSpeech"
        :api-key-configured="apiKeyConfigured"
        default-text="Hello! This is a test of the MiniMax Speech synthesis."
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
