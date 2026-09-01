<script setup lang="ts">
import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import {
  SpeechPlayground,
  SpeechProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { FieldSelect } from '@proj-airi/ui'
import { computed, toRaw, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import DoubaoVoicePicker from './doubao-speech/voice-picker.vue'
import DoubaoVoiceSettingsPanel from './doubao-speech/voice-settings-panel.vue'

const providerId = 'doubao-speech'

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

const resourceId = computed<DoubaoResourceId>({
  get: () => getProviderConfig()?.resourceId as DoubaoResourceId | undefined ?? 'seed-tts-2.0',
  set: (value) => {
    const config = getProviderConfig()
    if (!config || config.resourceId === value)
      return

    Object.assign(config, {
      resourceId: value,
      speaker: '',
    })
  },
})

const speaker = computed({
  get: () => getProviderConfig()?.speaker as string | undefined ?? '',
  set: value => updateConfig({ speaker: value }),
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
  // validateProviderConfig is a synced action: its arguments cross the
  // BroadcastChannel boundary with structuredClone, so pass a plain snapshot
  // instead of the reactive store object.
  if ((await providersStore.validateProviderConfig(providerId, structuredClone(toRaw(providerConfig)))).valid)
    await speechStore.loadVoicesForProvider(providerId)
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
      <DoubaoVoiceSettingsPanel />
    </template>

    <template #playground>
      <SpeechPlayground
        :available-voices="availableVoices"
        :generate-speech="handleGenerateSpeech"
        :api-key-configured="apiKeyConfigured"
        :fixed-voice="speaker"
        :ssml-supported="false"
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
