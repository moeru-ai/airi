<script setup lang="ts">
import type { SpeechProvider } from '@xsai-ext/providers/utils'

import {
  SpeechPlayground,
  SpeechProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { FieldInput } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const providerId = 'gpt-sovits'
const defaultModel = 'gpt-sovits'

const speechStore = useSpeechStore()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore)

const refAudioPath = computed({
  get: () => providers.value[providerId]?.refAudioPath as string | undefined || '',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].refAudioPath = value
  },
})

const promptText = computed({
  get: () => providers.value[providerId]?.promptText as string | undefined || '',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].promptText = value
  },
})

const promptLang = computed({
  get: () => providers.value[providerId]?.promptLang as string | undefined || 'zh',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].promptLang = value
  },
})

const textLang = computed({
  get: () => providers.value[providerId]?.textLang as string | undefined || 'zh',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].textLang = value
  },
})

const gptWeightsPath = computed({
  get: () => providers.value[providerId]?.gptWeightsPath as string | undefined || '',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].gptWeightsPath = value
  },
})

const sovitsWeightsPath = computed({
  get: () => providers.value[providerId]?.sovitsWeightsPath as string | undefined || '',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].sovitsWeightsPath = value
  },
})

const apiKeyConfigured = computed(() => !!providers.value[providerId]?.baseUrl)

const availableVoices = computed(() => speechStore.availableVoices[providerId] || [])

onMounted(async () => {
  await speechStore.loadVoicesForProvider(providerId)
})

watch([apiKeyConfigured], async () => {
  await speechStore.loadVoicesForProvider(providerId)
})

async function handleGenerateSpeech(input: string, voiceId: string) {
  const provider = await providersStore.getProviderInstance(providerId) as SpeechProvider
  if (!provider)
    throw new Error('Failed to initialize speech provider')

  const providerConfig = providersStore.getProviderConfig(providerId)

  return await speechStore.speech(provider, defaultModel, input, voiceId, providerConfig)
}
</script>

<template>
  <SpeechProviderSettings :provider-id="providerId" :default-model="defaultModel">
    <template #basic-settings>
      <p :class="['text-sm', 'text-blue-500', 'dark:text-blue-400', 'px-1']">
        ⓘ {{ t('settings.pages.providers.provider.gpt-sovits.callout_model_switch') }}
      </p>
      <p :class="['text-sm', 'text-neutral-400', 'dark:text-neutral-500', 'px-1']">
        ⓘ {{ t('settings.pages.providers.provider.gpt-sovits.callout_no_api_key') }}
      </p>
      <FieldInput
        v-model="refAudioPath"
        :label="t('settings.pages.providers.provider.gpt-sovits.fields.refAudioPath.label')"
        :description="t('settings.pages.providers.provider.gpt-sovits.fields.refAudioPath.description')"
        placeholder="/path/to/reference.wav"
        required
        type="text"
      />
      <FieldInput
        v-model="promptText"
        :label="t('settings.pages.providers.provider.gpt-sovits.fields.promptText.label')"
        :description="t('settings.pages.providers.provider.gpt-sovits.fields.promptText.description')"
        placeholder="参考音频中说的文字（可选）"
        type="text"
      />
      <FieldInput
        v-model="gptWeightsPath"
        :label="t('settings.pages.providers.provider.gpt-sovits.fields.gptWeightsPath.label')"
        :description="t('settings.pages.providers.provider.gpt-sovits.fields.gptWeightsPath.description')"
        placeholder="/path/to/gpt.ckpt"
        type="text"
      />
      <FieldInput
        v-model="sovitsWeightsPath"
        :label="t('settings.pages.providers.provider.gpt-sovits.fields.sovitsWeightsPath.label')"
        :description="t('settings.pages.providers.provider.gpt-sovits.fields.sovitsWeightsPath.description')"
        placeholder="/path/to/sovits.pth"
        type="text"
      />
    </template>

    <template #voice-settings>
      <FieldInput
        v-model="promptLang"
        :label="t('settings.pages.providers.provider.gpt-sovits.fields.promptLang.label')"
        :description="t('settings.pages.providers.provider.gpt-sovits.fields.promptLang.description')"
        placeholder="zh"
        type="text"
      />
      <FieldInput
        v-model="textLang"
        :label="t('settings.pages.providers.provider.gpt-sovits.fields.textLang.label')"
        :description="t('settings.pages.providers.provider.gpt-sovits.fields.textLang.description')"
        placeholder="zh"
        type="text"
      />
    </template>

    <template #playground>
      <SpeechPlayground
        :available-voices="availableVoices"
        :generate-speech="handleGenerateSpeech"
        :api-key-configured="apiKeyConfigured"
        :use-ssml="false"
        default-text="你好，我是 AIRI，很高兴认识你！"
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
