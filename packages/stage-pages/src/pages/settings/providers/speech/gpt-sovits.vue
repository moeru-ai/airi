<script setup lang="ts">
import type { SpeechProvider } from '@xsai-ext/providers/utils'

import {
  SpeechPlayground,
  SpeechProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { Callout, FieldInput, FieldSelect } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const providerId = 'gpt-sovits'
const defaultModel = 'gpt-sovits'
const languageOptions = ['auto', 'auto_yue', 'en', 'zh', 'ja', 'yue', 'ko', 'all_zh', 'all_ja', 'all_yue', 'all_ko'].map(code => ({ label: code, value: code }))

const speechStore = useSpeechStore()
const providersStore = useProviderStore()
const providerConfigStore = useProviderConfigStore()
const { configs: providers } = storeToRefs(providerConfigStore)

function setConfigField(field: string, value: string) {
  void providerConfigStore.patchProviderConfig(providerId, { [field]: value })
}

const refAudioPath = computed({
  get: () => providers.value[providerId]?.refAudioPath as string | undefined || '',
  set: value => setConfigField('refAudioPath', value),
})

const promptText = computed({
  get: () => providers.value[providerId]?.promptText as string | undefined || '',
  set: value => setConfigField('promptText', value),
})

const promptLang = computed({
  get: () => providers.value[providerId]?.promptLang as string | undefined || 'zh',
  set: value => setConfigField('promptLang', value),
})

const textLang = computed({
  get: () => providers.value[providerId]?.textLang as string | undefined || 'zh',
  set: value => setConfigField('textLang', value),
})

const gptWeightsPath = computed({
  get: () => providers.value[providerId]?.gptWeightsPath as string | undefined || '',
  set: value => setConfigField('gptWeightsPath', value),
})

const sovitsWeightsPath = computed({
  get: () => providers.value[providerId]?.sovitsWeightsPath as string | undefined || '',
  set: value => setConfigField('sovitsWeightsPath', value),
})

const apiKeyConfigured = computed(() => !!providers.value[providerId]?.baseUrl)

const availableVoices = computed(() => speechStore.availableVoices[providerId] || [])

onMounted(async () => {
  await speechStore.loadVoicesForProvider(providerId)
})

watch([apiKeyConfigured, textLang], async () => {
  await speechStore.loadVoicesForProvider(providerId)
})

async function handleGenerateSpeech(input: string, voiceId: string) {
  const provider = await providersStore.getProviderInstance(providerId) as SpeechProvider
  if (!provider)
    throw new Error('Failed to initialize speech provider')

  const providerConfig = providerConfigStore.getProviderConfig(providerId)

  return await speechStore.speech(provider, defaultModel, input, voiceId, providerConfig)
}
</script>

<template>
  <SpeechProviderSettings :provider-id="providerId" :default-model="defaultModel">
    <template #basic-settings>
      <Callout :label="t('settings.pages.providers.provider.gpt-sovits.callout_no_model_title')">
        {{ t('settings.pages.providers.provider.gpt-sovits.callout_model_switch') }}
      </Callout>
      <p :class="['text-sm', 'text-neutral-400', 'dark:text-neutral-500', 'px-1']">
        ⓘ {{ t('settings.pages.providers.provider.gpt-sovits.callout_no_api_key') }}
      </p>
      <FieldInput
        v-model="refAudioPath"
        :label="t('settings.pages.providers.provider.gpt-sovits.fields.refAudioPath.label')"
        :description="t('settings.pages.providers.provider.gpt-sovits.fields.refAudioPath.description')"
        :placeholder="t('settings.pages.providers.provider.gpt-sovits.fields.refAudioPath.placeholder')"
        required
        type="text"
      />
      <FieldInput
        v-model="promptText"
        :label="t('settings.pages.providers.provider.gpt-sovits.fields.promptText.label')"
        :description="t('settings.pages.providers.provider.gpt-sovits.fields.promptText.description')"
        :placeholder="t('settings.pages.providers.provider.gpt-sovits.fields.promptText.placeholder')"
        type="text"
      />
      <FieldInput
        v-model="gptWeightsPath"
        :label="t('settings.pages.providers.provider.gpt-sovits.fields.gptWeightsPath.label')"
        :description="t('settings.pages.providers.provider.gpt-sovits.fields.gptWeightsPath.description')"
        :placeholder="t('settings.pages.providers.provider.gpt-sovits.fields.gptWeightsPath.placeholder')"
        type="text"
      />
      <FieldInput
        v-model="sovitsWeightsPath"
        :label="t('settings.pages.providers.provider.gpt-sovits.fields.sovitsWeightsPath.label')"
        :description="t('settings.pages.providers.provider.gpt-sovits.fields.sovitsWeightsPath.description')"
        :placeholder="t('settings.pages.providers.provider.gpt-sovits.fields.sovitsWeightsPath.placeholder')"
        type="text"
      />
    </template>

    <template #voice-settings>
      <FieldSelect
        v-model="promptLang"
        :label="t('settings.pages.providers.provider.gpt-sovits.fields.promptLang.label')"
        :description="t('settings.pages.providers.provider.gpt-sovits.fields.promptLang.description')"
        :options="languageOptions"
      />
      <FieldSelect
        v-model="textLang"
        :label="t('settings.pages.providers.provider.gpt-sovits.fields.textLang.label')"
        :description="t('settings.pages.providers.provider.gpt-sovits.fields.textLang.description')"
        :options="languageOptions"
      />
    </template>

    <template #playground>
      <SpeechPlayground
        :available-voices="availableVoices"
        :generate-speech="handleGenerateSpeech"
        :api-key-configured="apiKeyConfigured"
        :use-ssml="false"
        :default-text="t('settings.pages.providers.provider.gpt-sovits.fields.textLang.playground-default-text')"
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
