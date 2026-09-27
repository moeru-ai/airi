<script setup lang="ts">
import type { SpeechProvider } from '@xsai-ext/providers/utils'

import {
  Alert,
  SpeechPlayground,
  SpeechProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useProviderValidation } from '@proj-airi/stage-ui/composables/use-provider-validation'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { FieldInput, FieldRange, FieldSelect } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const providerId = 'chutes-ai-speech'
const defaultModel = 'kokoro'

const { t } = useI18n()
const speechStore = useSpeechStore()
const providersStore = useProviderStore()
const providerStore = useProviderConfigStore()
const { configs: providers } = storeToRefs(providerStore)

// The Speech module owns the model that AIRI speaks with. This choice only
// selects the preview route and voice list, so it stays local to the page.
const playgroundModel = ref(defaultModel)
const modelOptions = computed(() => providersStore.getModelsForProvider(providerId).map(model => ({
  value: model.id,
  label: model.name,
  description: model.description,
})))
const availableVoices = computed(() => (speechStore.availableVoices[providerId] || [])
  .filter(voice => voice.compatibleModels?.includes(playgroundModel.value)))
const apiKeyConfigured = computed(() => !!providers.value[providerId]?.apiKey)

const { isValidating, isValid, validationMessage, forceValid } = useProviderValidation(providerId)

onMounted(async () => {
  await providersStore.fetchModelsForProvider(providerId)
})

async function handleGenerateSpeech(input: string, voiceId: string) {
  const provider = await providersStore.getProviderInstance<SpeechProvider<string>>(providerId)
  if (!provider)
    throw new Error('Failed to initialize speech provider')

  return await speechStore.speech(
    provider,
    playgroundModel.value,
    input,
    voiceId,
    { ...providerStore.getProviderConfig(providerId) },
  )
}
</script>

<template>
  <SpeechProviderSettings :provider-id="providerId" :default-model="defaultModel" placeholder="cpk_...">
    <template #basic-settings>
      <Alert v-if="!isValid && isValidating === 0 && validationMessage" type="error">
        <template #title>
          <div class="w-full flex items-center justify-between">
            <span>{{ t('settings.dialogs.onboarding.validationFailed') }}</span>
            <button
              type="button"
              class="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs text-red-600 font-medium transition-colors dark:bg-red-800/30 hover:bg-red-200 dark:text-red-300 dark:hover:bg-red-700/40"
              @click="forceValid"
            >
              {{ t('settings.pages.providers.common.continueAnyway') }}
            </button>
          </div>
        </template>
        <template #content>
          <div class="whitespace-pre-wrap break-all">
            {{ validationMessage }}
          </div>
        </template>
      </Alert>
    </template>

    <template #voice-settings="{ voiceSettings }">
      <div class="flex flex-col gap-4">
        <!-- Kokoro reads speed. Qwen3-TTS ignores it and reads language and style instead. -->
        <FieldRange
          v-model="voiceSettings.speed"
          :label="t('settings.pages.providers.provider.common.fields.field.speed.label')"
          :description="t('settings.pages.providers.provider.chutes.fields.field.speed.description')"
          :min="0.5" :max="2" :step="0.01"
        />
        <FieldInput
          v-model="voiceSettings.language"
          :label="t('settings.pages.providers.provider.chutes.fields.field.language.label')"
          :description="t('settings.pages.providers.provider.chutes.fields.field.language.description')"
          placeholder="English"
        />
        <FieldInput
          v-model="voiceSettings.instruct"
          :label="t('settings.pages.providers.provider.chutes.fields.field.instruct.label')"
          :description="t('settings.pages.providers.provider.chutes.fields.field.instruct.description')"
          :placeholder="t('settings.pages.providers.provider.chutes.fields.field.instruct.placeholder')"
        />
      </div>
    </template>

    <template #playground>
      <div class="flex flex-col gap-4">
        <FieldSelect
          v-model="playgroundModel"
          :label="t('settings.pages.providers.provider.chutes.fields.field.playground-model.label')"
          :description="t('settings.pages.providers.provider.chutes.fields.field.playground-model.description')"
          :options="modelOptions"
        />
        <!-- The playground keeps its selected voice while the list changes, so remount it per model. -->
        <SpeechPlayground
          :key="playgroundModel"
          :available-voices="availableVoices"
          :generate-speech="handleGenerateSpeech"
          :api-key-configured="apiKeyConfigured"
          :use-ssml="false"
          default-text="Hello! This is a test of Chutes speech."
        />
      </div>
    </template>
  </SpeechProviderSettings>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
