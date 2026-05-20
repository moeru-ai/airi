<script setup lang="ts">
import type { SpeechProvider } from '@xsai-ext/providers/utils'

import {
  SpeechPlayground,
  SpeechProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { FieldInput } from '@proj-airi/ui'
import { useDebounceFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, watch } from 'vue'

const providerId = 'gpt-sovits'
const defaultModel = 'gpt-sovits'

const speechStore = useSpeechStore()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore)

function ensureConfig() {
  if (!providers.value[providerId])
    providers.value[providerId] = {}
}

function setField(key: string, value: unknown) {
  // Replace the whole config object to guarantee Vue's reactive tracking fires
  // and the deep watch in the providers store triggers re-validation.
  providers.value[providerId] = {
    ...providers.value[providerId],
    [key]: value,
  }
}

const refAudioPath = computed({
  get: () => providers.value[providerId]?.refAudioPath as string | undefined || '',
  set: value => setField('refAudioPath', value),
})

const promptText = computed({
  get: () => providers.value[providerId]?.promptText as string | undefined || '',
  set: value => setField('promptText', value),
})

const promptLang = computed({
  get: () => providers.value[providerId]?.promptLang as string | undefined || 'auto',
  set: value => setField('promptLang', value),
})

const textLang = computed({
  get: () => providers.value[providerId]?.textLang as string | undefined || 'auto',
  set: value => setField('textLang', value),
})

const availableVoices = computed(() => speechStore.availableVoices[providerId] || [])

// Force re-validation after custom fields change so the green "configured"
// indicator in the providers list updates promptly.
const debouncedValidate = useDebounceFn(() => {
  void providersStore.validateProvider(providerId, { force: true })
}, 600)

watch([refAudioPath, promptText, promptLang, textLang], debouncedValidate)

onMounted(async () => {
  ensureConfig()
  // Run an initial validation so the configured state is correct when
  // the user returns to the providers list.
  void providersStore.validateProvider(providerId, { force: true })
  await speechStore.loadVoicesForProvider(providerId)
})

async function handleGenerateSpeech(input: string, voiceId: string) {
  const provider = await providersStore.getProviderInstance(providerId) as SpeechProvider
  if (!provider)
    throw new Error('Failed to initialize speech provider')

  const providerConfig = providersStore.getProviderConfig(providerId)
  const model = (providerConfig.model as string | undefined) || defaultModel

  return await speechStore.speech(provider, model, input, voiceId, { ...providerConfig })
}
</script>

<template>
  <SpeechProviderSettings :provider-id="providerId" :default-model="defaultModel">
    <template #basic-settings>
      <FieldInput
        v-model="refAudioPath"
        label="Reference Audio Path"
        description="Absolute path to the reference WAV file used as the voice prompt."
        placeholder="C:\path\to\reference.wav"
        required
      />
      <FieldInput
        v-model="promptText"
        label="Reference Audio Transcript"
        description="The text spoken in the reference audio."
        placeholder="これは私の身勝手な考えかもしれません。"
        required
      />
      <FieldInput
        v-model="promptLang"
        label="Reference Audio Language"
        description="Language of the reference audio: zh, en, ja, auto, auto_yue, zh_ja, zh_en, ja_en."
        placeholder="auto"
      />
      <FieldInput
        v-model="textLang"
        label="Output Text Language"
        description="Language of the text to synthesize. Same options as reference audio language."
        placeholder="auto"
      />
    </template>

    <template #playground>
      <SpeechPlayground
        :available-voices="availableVoices"
        :generate-speech="handleGenerateSpeech"
        :api-key-configured="true"
        :use-ssml="false"
        default-text="こんにちは！これはGPT-SoVITSの音声合成テストです。"
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
