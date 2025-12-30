<script setup lang="ts">
import type { RemovableRef } from '@vueuse/core'
import type { SpeechProvider } from '@xsai-ext/providers/utils'

import {
  Alert,
  ProviderAdvancedSettings,
  ProviderApiKeyInput,
  ProviderBaseUrlInput,
  ProviderBasicSettings,
  ProviderSettingsContainer,
  ProviderSettingsLayout,
  SpeechPlaygroundOpenAICompatible,
} from '@proj-airi/stage-ui/components'
import { useProviderValidation } from '@proj-airi/stage-ui/composables/use-provider-validation'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { FieldRange } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

const speechStore = useSpeechStore()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore) as { providers: RemovableRef<Record<string, any>> }

const defaultVoiceSettings = {
  speed: 1.0,
}

// Get provider metadata
const providerId = 'openai-compatible-audio-speech'

// Settings refs
const apiKey = computed({
  get: () => providers.value[providerId]?.apiKey || '',
  set: (value) => {
    if (providers.value[providerId])
      providers.value[providerId].apiKey = value
  },
})

const baseUrl = computed({
  get: () => providers.value[providerId]?.baseUrl || '',
  set: (value) => {
    if (providers.value[providerId])
      providers.value[providerId].baseUrl = value
  },
})

const model = computed({
  get: () => providers.value[providerId]?.model || 'tts-1',
  set: (value) => {
    if (providers.value[providerId])
      providers.value[providerId].model = value
  },
})

const voice = computed({
  get: () => providers.value[providerId]?.voice || 'alloy',
  set: (value) => {
    if (providers.value[providerId])
      providers.value[providerId].voice = value
  },
})

const speed = ref<number>(1.0)

// Check if API key is configured
const apiKeyConfigured = computed(() => !!providers.value[providerId]?.apiKey)

// Generate speech with specific parameters
async function handleGenerateSpeech(input: string, voiceId: string, _useSSML: boolean, modelId?: string) {
  const provider = await providersStore.getProviderInstance<SpeechProvider<string>>(providerId)
  if (!provider)
    throw new Error('Failed to initialize speech provider')

  const providerConfig = providersStore.getProviderConfig(providerId)

  return await speechStore.speech(
    provider,
    modelId || model.value,
    input,
    voiceId || voice.value,
    {
      ...providerConfig,
      ...defaultVoiceSettings,
      speed: speed.value,
    },
  )
}

// Use the composable to get validation logic and state
const {
  t,
  router,
  providerMetadata,
  isValidating,
  isValid,
  validationMessage,
  handleResetSettings,
  forceValid,
} = useProviderValidation(providerId)
</script>

<template>
  <ProviderSettingsLayout
    :provider-name="providerMetadata?.localizedName"
    :provider-icon-color="providerMetadata?.iconColor"
    :on-back="() => router.back()"
  >
    <ProviderSettingsContainer>
      <ProviderBasicSettings
        :title="t('settings.pages.providers.common.section.basic.title')"
        :description="t('settings.pages.providers.common.section.basic.description')"
        :on-reset="handleResetSettings"
      >
        <ProviderApiKeyInput
          v-model="apiKey"
          :required="false"
          :provider-name="providerMetadata?.localizedName"
          placeholder="sk-..."
        />
      </ProviderBasicSettings>

      <ProviderAdvancedSettings :title="t('settings.pages.providers.common.section.advanced.title')">
        <ProviderBaseUrlInput
          v-model="baseUrl"
          placeholder="https://api.openai.com/v1/"
        />
        <FieldRange
          v-model="speed"
          :label="t('settings.pages.providers.provider.common.fields.field.speed.label')"
          :description="t('settings.pages.providers.provider.common.fields.field.speed.description')"
          :min="0.5"
          :max="2.0" :step="0.01"
        />
      </ProviderAdvancedSettings>

      <!-- Validation Status -->
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
        <template v-if="validationMessage" #content>
          <div class="whitespace-pre-wrap break-all">
            {{ validationMessage }}
          </div>
        </template>
      </Alert>
      <Alert v-if="isValid && isValidating === 0" type="success">
        <template #title>
          {{ t('settings.dialogs.onboarding.validationSuccess') }}
        </template>
      </Alert>
    </ProviderSettingsContainer>

    <SpeechPlaygroundOpenAICompatible
      v-model:model-value="model"
      v-model:voice="voice"
      :generate-speech="handleGenerateSpeech"
      :api-key-configured="apiKeyConfigured"
      default-text="Hello! This is a test of the OpenAI Compatible Speech."
    />
  </ProviderSettingsLayout>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
