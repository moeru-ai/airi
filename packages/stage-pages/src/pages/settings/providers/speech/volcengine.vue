<script setup lang="ts">
import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'
import type { UnVolcengineOptions } from 'unspeech'

import {
  SpeechPlayground,
  SpeechProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { FieldInput, FieldRange, FieldSelect } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const providerId = 'volcengine'
const defaultModel = 'v1'

const speechStore = useSpeechStore()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore)
const { t } = useI18n()

const appConfig = computed(() => (providers.value[providerId]?.app ?? {}) as Record<string, unknown>)
const audioConfig = computed(() => (appConfig.value?.audio ?? {}) as Record<string, unknown>)

function setAppField(key: string, value: unknown) {
  if (!providers.value[providerId])
    providers.value[providerId] = {}
  if (!providers.value[providerId].app)
    providers.value[providerId].app = {}
  const app = providers.value[providerId].app as Record<string, unknown>
  if (!app.audio)
    app.audio = {}
  ;(app.audio as Record<string, unknown>)[key] = value
}

const resourceId = computed({
  get: () => (appConfig.value?.resource_id as string) || 'seed-tts-2.0',
  set: (v) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    if (!providers.value[providerId].app)
      providers.value[providerId].app = {}
    ;(providers.value[providerId].app as Record<string, unknown>).resource_id = v
  },
})

const speaker = computed({
  get: () => (appConfig.value?.speaker as string) || '',
  set: (v) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    if (!providers.value[providerId].app)
      providers.value[providerId].app = {}
    ;(providers.value[providerId].app as Record<string, unknown>).speaker = v
    providers.value[providerId].voice = v
  },
})

const format = computed({
  get: () => (audioConfig.value?.format as string) || 'mp3',
  set: v => setAppField('format', v),
})

const sampleRate = computed({
  get: () => (audioConfig.value?.sample_rate as number) || 24000,
  set: v => setAppField('sample_rate', v),
})

const bitRate = computed({
  get: () => (audioConfig.value?.bit_rate as number) || 128000,
  set: v => setAppField('bit_rate', v),
})

const speechRate = computed({
  get: () => (audioConfig.value?.speech_rate as number) || 0,
  set: v => setAppField('speech_rate', v),
})

const loudnessRate = computed({
  get: () => (audioConfig.value?.loudness_rate as number) || 0,
  set: v => setAppField('loudness_rate', v),
})

const pitch = computed({
  get: () => (audioConfig.value?.pitch as number) || 0,
  set: v => setAppField('pitch', v),
})

const emotion = computed({
  get: () => (audioConfig.value?.emotion as string) || '',
  set: v => setAppField('emotion', v),
})

const emotionScale = computed({
  get: () => (audioConfig.value?.emotion_scale as number) || 4,
  set: v => setAppField('emotion_scale', v),
})

const resourceIdOptions = [
  { label: '豆包语音合成 2.0 (seed-tts-2.0)', value: 'seed-tts-2.0' },
  { label: '豆包语音合成 1.0 (seed-tts-1.0)', value: 'seed-tts-1.0' },
  { label: '豆包语音合成 1.0 并发版 (seed-tts-1.0-concurr)', value: 'seed-tts-1.0-concurr' },
  { label: '声音复刻 2.0 (seed-icl-2.0)', value: 'seed-icl-2.0' },
  { label: '声音复刻 1.0 (seed-icl-1.0)', value: 'seed-icl-1.0' },
  { label: '声音复刻 1.0 并发版 (seed-icl-1.0-concurr)', value: 'seed-icl-1.0-concurr' },
]

const formatOptions = [
  { label: 'mp3', value: 'mp3' },
  { label: 'ogg_opus', value: 'ogg_opus' },
  { label: 'pcm', value: 'pcm' },
]

const apiKeyConfigured = computed(() => !!providers.value[providerId]?.apiKey)

const availableVoices = computed(() => {
  return speechStore.availableVoices[providerId] || []
})

async function handleGenerateSpeech(input: string, voiceId: string, _useSSML: boolean) {
  const provider = await providersStore.getProviderInstance(providerId) as SpeechProviderWithExtraOptions<string, UnVolcengineOptions>
  if (!provider) {
    throw new Error('Failed to initialize speech provider')
  }

  const providerConfig = providersStore.getProviderConfig(providerId)
  const app = (providerConfig.app ?? {}) as Record<string, unknown>

  return await speechStore.speech(
    provider,
    defaultModel,
    input,
    voiceId,
    {
      resourceId: app.resource_id as string | undefined,
      audio: app.audio as UnVolcengineOptions['audio'] | undefined,
    },
  )
}

function syncV3ParamsToTopLevel() {
  if (!providers.value[providerId])
    return
  const cfg = providers.value[providerId]
  const app = (cfg.app ?? {}) as Record<string, unknown>
  if (app.resource_id)
    cfg.resourceId = app.resource_id
  if (app.audio)
    cfg.audio = app.audio
  if (app.speaker && !cfg.voice)
    cfg.voice = app.speaker
}

onMounted(async () => {
  const providerConfig = providersStore.getProviderConfig(providerId)
  const providerMetadata = providersStore.getProviderMetadata(providerId)
  // Sync voice from speaker for speech module auto-selection
  if ((providerConfig.app as any)?.speaker && !providerConfig.voice) {
    providerConfig.voice = (providerConfig.app as any).speaker
  }
  syncV3ParamsToTopLevel()
  if (await providerMetadata.validators.validateProviderConfig(providerConfig)) {
    await speechStore.loadVoicesForProvider(providerId)
  }
  else {
    console.error('Failed to validate provider config', providerConfig)
  }
})

watch([providers, resourceId, speaker], async () => {
  const providerConfig = providersStore.getProviderConfig(providerId)
  const providerMetadata = providersStore.getProviderMetadata(providerId)
  syncV3ParamsToTopLevel()
  if (await providerMetadata.validators.validateProviderConfig(providerConfig)) {
    await speechStore.loadVoicesForProvider(providerId)
  }
}, {
  immediate: true,
})
</script>

<template>
  <SpeechProviderSettings
    :provider-id="providerId"
    :default-model="defaultModel"
  >
    <template #voice-settings>
      <div flex="~ col gap-4">
        <FieldSelect
          v-model="resourceId"
          :label="t('settings.pages.providers.provider.volcengine.fields.field.resource_id.label')"
          :description="t('settings.pages.providers.provider.volcengine.fields.field.resource_id.description')"
          :options="resourceIdOptions"
        />

        <FieldInput
          v-model="speaker"
          :label="t('settings.pages.providers.provider.volcengine.fields.field.speaker.label')"
          :description="t('settings.pages.providers.provider.volcengine.fields.field.speaker.description')"
          placeholder="zh_female_meilinvyou_uranus_bigtts"
        />

        <FieldSelect
          v-model="format"
          :label="t('settings.pages.providers.provider.volcengine.fields.field.format.label')"
          :description="t('settings.pages.providers.provider.volcengine.fields.field.format.description')"
          :options="formatOptions"
        />

        <FieldInput
          v-model="sampleRate"
          :label="t('settings.pages.providers.provider.volcengine.fields.field.sample_rate.label')"
          :description="t('settings.pages.providers.provider.volcengine.fields.field.sample_rate.description')"
          type="number"
        />

        <FieldInput
          v-model="bitRate"
          :label="t('settings.pages.providers.provider.volcengine.fields.field.bit_rate.label')"
          :description="t('settings.pages.providers.provider.volcengine.fields.field.bit_rate.description')"
          type="number"
        />

        <FieldRange
          v-model="speechRate"
          :label="t('settings.pages.providers.provider.volcengine.fields.field.speech_rate.label')"
          :description="t('settings.pages.providers.provider.volcengine.fields.field.speech_rate.description')"
          :min="-50" :max="100" :step="1"
        />

        <FieldRange
          v-model="loudnessRate"
          :label="t('settings.pages.providers.provider.volcengine.fields.field.loudness_rate.label')"
          :description="t('settings.pages.providers.provider.volcengine.fields.field.loudness_rate.description')"
          :min="-50" :max="100" :step="1"
        />

        <FieldRange
          v-model="pitch"
          :label="t('settings.pages.providers.provider.volcengine.fields.field.pitch.label')"
          :description="t('settings.pages.providers.provider.volcengine.fields.field.pitch.description')"
          :min="-12" :max="12" :step="1"
        />

        <FieldInput
          v-model="emotion"
          :label="t('settings.pages.providers.provider.volcengine.fields.field.emotion.label')"
          :description="t('settings.pages.providers.provider.volcengine.fields.field.emotion.description')"
          placeholder="happy"
        />

        <FieldRange
          v-model="emotionScale"
          :label="t('settings.pages.providers.provider.volcengine.fields.field.emotion_scale.label')"
          :description="t('settings.pages.providers.provider.volcengine.fields.field.emotion_scale.description')"
          :min="1" :max="5" :step="1"
        />
      </div>
    </template>

    <template #playground>
      <SpeechPlayground
        :available-voices="availableVoices"
        :generate-speech="handleGenerateSpeech"
        :api-key-configured="apiKeyConfigured"
        :preferred-voice="speaker"
        default-text="你好！这是一段火山引擎语音合成测试。"
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
