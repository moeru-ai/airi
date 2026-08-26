<script setup lang="ts">
import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import {
  SpeechPlayground,
  SpeechProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { FieldRange, FieldSelect, FieldTextArea } from '@proj-airi/ui'
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import DoubaoVoicePicker from './doubao-speech/voice-picker.vue'

const providerId = 'doubao-speech'
const AUTO_LANGUAGE_VALUE = '__auto__'
const NO_DIALECT_VALUE = '__none__'

type DoubaoResourceId = 'seed-icl-2.0' | 'seed-tts-2.0'

const speechStore = useSpeechStore()
const providersStore = useProviderStore()
const providerStore = useProviderConfigStore()
const { t } = useI18n()

function getProviderConfig() {
  return providerStore.getProviderConfig(providerId)
}

function updateConfig(patch: Record<string, unknown>) {
  const config = getProviderConfig()
  if (config)
    Object.assign(config, patch)
}

function updateAudio(patch: Record<string, unknown>) {
  const value = getProviderConfig()?.audio
  const current = value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
  updateConfig({ audio: current ? { ...current, ...patch } : { ...patch } })
}

function audioValue<T>(key: string, fallback: T): T {
  const audio = getProviderConfig()?.audio as Record<string, unknown> | undefined
  return (audio?.[key] as T | undefined) ?? fallback
}

const resourceId = computed<DoubaoResourceId>({
  get: () => getProviderConfig()?.resourceId as DoubaoResourceId | undefined ?? 'seed-tts-2.0',
  set: value => updateConfig({ resourceId: value }),
})

const speaker = computed({
  get: () => getProviderConfig()?.speaker as string | undefined ?? '',
  set: value => updateConfig({ speaker: value }),
})

const format = computed({
  get: () => audioValue('format', 'mp3'),
  set: value => updateAudio({ format: value }),
})
const sampleRate = computed({
  get: () => audioValue('sampleRate', 24000),
  set: value => updateAudio({ sampleRate: value }),
})
const speechRate = computed({
  get: () => audioValue('speechRate', 0),
  set: value => updateAudio({ speechRate: value }),
})
const loudnessRate = computed({
  get: () => audioValue('loudnessRate', 0),
  set: value => updateAudio({ loudnessRate: value }),
})
const pitch = computed({
  get: () => audioValue('pitch', 0),
  set: value => updateAudio({ pitch: value }),
})

const explicitLanguage = computed({
  get: () => getProviderConfig()?.explicitLanguage as string | undefined || AUTO_LANGUAGE_VALUE,
  set: value => updateConfig({ explicitLanguage: value === AUTO_LANGUAGE_VALUE ? '' : value }),
})
const explicitDialect = computed({
  get: () => getProviderConfig()?.explicitDialect as string | undefined || NO_DIALECT_VALUE,
  set: value => updateConfig({ explicitDialect: value === NO_DIALECT_VALUE ? '' : value }),
})

const voiceInstruction = computed({
  get: () => getProviderConfig()?.voiceInstruction as string | undefined ?? '',
  set: value => updateConfig({ voiceInstruction: value }),
})

const resourceIdOptions = computed(() => [
  {
    value: 'seed-tts-2.0',
    label: t('settings.pages.providers.provider.doubao-speech.fields.field.resource-id.options.official'),
  },
  {
    value: 'seed-icl-2.0',
    label: t('settings.pages.providers.provider.doubao-speech.fields.field.resource-id.options.clone'),
  },
])

const formatOptions = [
  { value: 'mp3', label: 'mp3' },
  { value: 'pcm', label: 'pcm' },
  { value: 'ogg_opus', label: 'ogg_opus' },
  { value: 'wav', label: 'wav' },
]

const sampleRateOptions = [8000, 16000, 22050, 24000, 32000, 44100, 48000]
  .map(rate => ({ value: rate, label: `${rate} Hz` }))

const languageCodes = ['zh-cn', 'en', 'ja', 'es-mx', 'id', 'pt-br', 'pt', 'ko', 'it', 'de', 'fr', 'th', 'vi', 'ru', 'fil', 'ms', 'ar', 'pl', 'tr', 'sv']
const languageOptions = computed(() => [
  { value: AUTO_LANGUAGE_VALUE, label: t('settings.pages.providers.provider.doubao-speech.fields.field.explicit-language.options.auto') },
  ...languageCodes.map(code => ({
    value: code,
    label: t(`settings.pages.providers.provider.doubao-speech.fields.field.explicit-language.options.${code}`),
  })),
])

const dialectCodes = ['beijing', 'dongbei', 'henan', 'shaanxi', 'shanghai', 'sichuan', 'tianjin', 'yue']
const dialectOptions = computed(() => [
  { value: NO_DIALECT_VALUE, label: t('settings.pages.providers.provider.doubao-speech.fields.field.explicit-dialect.options.none') },
  ...dialectCodes.map(code => ({
    value: code,
    label: t(`settings.pages.providers.provider.doubao-speech.fields.field.explicit-dialect.options.${code}`),
  })),
])

const apiKeyConfigured = computed(() => !!getProviderConfig()?.apiKey)
const EMPTY_VOICES: never[] = []
const availableVoices = computed(() => speechStore.availableVoices[providerId] ?? EMPTY_VOICES)

async function handleGenerateSpeech(input: string, voiceId: string, _useSSML: boolean) {
  const provider = await providersStore.getProviderInstance(providerId) as SpeechProviderWithExtraOptions<string, Record<string, unknown>>
  if (!provider)
    throw new Error('Failed to initialize speech provider')

  const providerConfig = providerStore.getProviderConfig(providerId)

  return await speechStore.speech(provider, resourceId.value, input, voiceId, { ...providerConfig })
}

watch([apiKeyConfigured, resourceId, speaker], async () => {
  const providerConfig = providerStore.getProviderConfig(providerId)
  if (!providerConfig)
    return
  if ((await providersStore.validateProviderConfig(providerId, providerConfig)).valid)
    await speechStore.loadVoicesForProvider(providerId)
}, { immediate: true })

watch([format, sampleRate], ([nextFormat, nextSampleRate]) => {
  if (nextFormat === 'ogg_opus' && nextSampleRate !== 48000)
    sampleRate.value = 48000
}, { immediate: true })
</script>

<template>
  <SpeechProviderSettings :provider-id="providerId">
    <template #basic-settings>
      <div class="flex flex-col gap-4">
        <FieldSelect
          v-model="resourceId"
          :label="t('settings.pages.providers.provider.doubao-speech.fields.field.resource-id.label')"
          :description="t('settings.pages.providers.provider.doubao-speech.fields.field.resource-id.description')"
          :options="resourceIdOptions"
        />
        <DoubaoVoicePicker
          v-model="speaker"
          :resource-id="resourceId"
        />
      </div>
    </template>

    <template #voice-settings>
      <FieldRange
        v-model="speechRate"
        :label="t('settings.pages.providers.provider.doubao-speech.fields.field.speech-rate.label')"
        :description="t('settings.pages.providers.provider.doubao-speech.fields.field.speech-rate.description')"
        :min="-50"
        :max="100"
        :step="1"
        :default-value="0"
        as="div"
      />
      <FieldRange
        v-model="loudnessRate"
        :label="t('settings.pages.providers.provider.doubao-speech.fields.field.loudness-rate.label')"
        :description="t('settings.pages.providers.provider.doubao-speech.fields.field.loudness-rate.description')"
        :min="-50"
        :max="100"
        :step="1"
        :default-value="0"
        as="div"
      />
      <FieldRange
        v-model="pitch"
        :label="t('settings.pages.providers.provider.doubao-speech.fields.field.pitch.label')"
        :description="t('settings.pages.providers.provider.doubao-speech.fields.field.pitch.description')"
        :min="-12"
        :max="12"
        :step="1"
        :default-value="0"
        as="div"
      />
      <FieldSelect
        v-model="format"
        :label="t('settings.pages.providers.provider.doubao-speech.fields.field.format.label')"
        :description="t('settings.pages.providers.provider.doubao-speech.fields.field.format.description')"
        :options="formatOptions"
      />
      <FieldSelect
        v-model="sampleRate"
        :label="t('settings.pages.providers.provider.doubao-speech.fields.field.sample-rate.label')"
        :description="t('settings.pages.providers.provider.doubao-speech.fields.field.sample-rate.description')"
        :options="sampleRateOptions"
      />
      <FieldSelect
        v-model="explicitLanguage"
        :label="t('settings.pages.providers.provider.doubao-speech.fields.field.explicit-language.label')"
        :description="t('settings.pages.providers.provider.doubao-speech.fields.field.explicit-language.description')"
        :options="languageOptions"
      />
      <FieldSelect
        v-model="explicitDialect"
        :label="t('settings.pages.providers.provider.doubao-speech.fields.field.explicit-dialect.label')"
        :description="t('settings.pages.providers.provider.doubao-speech.fields.field.explicit-dialect.description')"
        :options="dialectOptions"
      />
      <FieldTextArea
        v-model="voiceInstruction"
        :label="t('settings.pages.providers.provider.doubao-speech.fields.field.voice-instruction.label')"
        :description="t('settings.pages.providers.provider.doubao-speech.fields.field.voice-instruction.description')"
        :placeholder="t('settings.pages.providers.provider.doubao-speech.fields.field.voice-instruction.placeholder')"
        :required="false"
        :rows="2"
      />
    </template>

    <template #playground>
      <SpeechPlayground
        :available-voices="availableVoices"
        :generate-speech="handleGenerateSpeech"
        :api-key-configured="apiKeyConfigured"
        :fixed-voice="speaker"
        default-text="你好！这是一段豆包语音合成的测试。"
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
