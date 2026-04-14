<script setup lang="ts">
import type { SpeechProvider } from '@xsai-ext/providers/utils'

import {
  Alert,
  SpeechPlaygroundOpenAICompatible,
  SpeechProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useProviderValidation } from '@proj-airi/stage-ui/composables/use-provider-validation'
import { getDefinedProvider } from '@proj-airi/stage-ui/libs'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { FieldInput, FieldRange } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const speechStore = useSpeechStore()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore)
const { t } = useI18n()

const defaultVoiceSettings = {
  speed: 1.0,
}

// Get provider metadata
const providerId = 'openai-compatible-audio-speech'
const defaultModel = 'tts-1'
const defaultVoice = 'alloy'

// Initialize speed from provider config or default
const speed = ref<number>(
  (providers.value[providerId] as any)?.voiceSettings?.speed
  || (providers.value[providerId] as any)?.speed
  || defaultVoiceSettings.speed,
)

// Model selection (store raw string; empty string is valid while editing — default is applied only at API call)
const model = computed({
  get: () => {
    const raw = providers.value[providerId]?.model as string | undefined | null
    return raw ?? ''
  },
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].model = value
  },
})

const voice = computed({
  get: () => {
    const raw = providers.value[providerId]?.voice as string | undefined | null
    return raw ?? ''
  },
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].voice = value
  },
})

// TODO: use `useRefHistory` for this
// Watch provider config changes to sync local refs (for reset functionality)
watch(
  () => providers.value[providerId],
  (newConfig) => {
    if (newConfig) {
      // Sync speed from voiceSettings or direct speed property
      const config = newConfig as any
      const newSpeed = config.voiceSettings?.speed || config.speed || defaultVoiceSettings.speed
      if (Math.abs(speed.value - newSpeed) > 0.001) // Use small epsilon for float comparison
        speed.value = newSpeed

      // Sync model if property was cleared externally (undefined/null), not when user sets empty string
      if (config.model == null && model.value !== defaultModel)
        model.value = defaultModel

      // Sync voice if property was cleared externally (undefined/null), not when user sets empty string
      if (config.voice == null && voice.value !== defaultVoice)
        voice.value = defaultVoice
    }
    else {
      // Provider config was reset, reset our local refs to defaults
      speed.value = defaultVoiceSettings.speed
      model.value = defaultModel
      voice.value = defaultVoice
    }
  },
  { deep: true, immediate: true },
)

// Check if API key is configured
const apiKeyConfigured = computed(() => !!providers.value[providerId]?.apiKey)

// Ensure provider config is initialized on mount
onMounted(() => {
  providers.value[providerId] ??= {}
  // Defaults only when unset (null/undefined); empty strings are kept intentionally
  providers.value[providerId].model ??= defaultModel
  providers.value[providerId].voice ??= defaultVoice
})

// Generate speech with OpenAI-compatible parameters
async function handleGenerateSpeech(input: string, voiceId: string, _useSSML: boolean, modelId?: string) {
  const provider = await providersStore.getProviderInstance<SpeechProvider<string>>(providerId)
  if (!provider) {
    throw new Error('Failed to initialize speech provider')
  }

  // Get provider configuration
  const providerConfig = providersStore.getProviderConfig(providerId)

  // Use the reactive model computed property (not a local variable)
  const modelToUse = modelId || model.value || defaultModel

  return await speechStore.speech(
    provider,
    modelToUse,
    input,
    voiceId || voice.value || defaultVoice,
    {
      ...providerConfig,
      ...defaultVoiceSettings,
      speed: speed.value,
    },
  )
}

watch(speed, async () => {
  if (!providers.value[providerId])
    providers.value[providerId] = {}
  providers.value[providerId].speed = speed.value
})

// Use the composable to get validation logic and state
const {
  isValidating,
  isValid,
  validationMessage,
  forceValid,
} = useProviderValidation(providerId)

const apiKeyPlaceholder = computed(() => {
  const definition = getDefinedProvider(providerId)
  if (!definition?.createProviderConfig)
    return 'sk-...'

  const schema = definition.createProviderConfig({ t }) as any
  const shape = typeof schema?.shape === 'function' ? schema.shape() : schema?.shape
  const apiKeySchema = shape?.apiKey
  if (!apiKeySchema)
    return 'sk-...'

  const meta = typeof apiKeySchema.meta === 'function' ? apiKeySchema.meta() : undefined
  return typeof meta?.placeholderLocalized === 'string' ? meta.placeholderLocalized : 'sk-...'
})
</script>

<template>
  <SpeechProviderSettings
    :provider-id="providerId"
    :default-model="defaultModel"
    :additional-settings="defaultVoiceSettings"
    :placeholder="apiKeyPlaceholder"
  >
    <!-- Voice settings specific to OpenAI Compatible -->
    <template #voice-settings>
      <!-- Model input -->
      <FieldInput
        v-model="model"
        label="Model"
        description="Enter the TTS model to use for speech generation"
        placeholder="tts-1"
      />
      <!-- Speed control - common to most providers -->
      <FieldRange
        v-model="speed"
        :label="t('settings.pages.providers.provider.common.fields.field.speed.label')"
        :description="t('settings.pages.providers.provider.common.fields.field.speed.description')"
        :min="0.5"
        :max="2.0" :step="0.01"
      />
    </template>

    <template #playground>
      <SpeechPlaygroundOpenAICompatible
        v-model:model-value="model"
        v-model:voice="voice as any"
        :generate-speech="handleGenerateSpeech"
        :api-key-configured="apiKeyConfigured"
        default-text="Hello! This is a test of the OpenAI Compatible Speech."
      />
    </template>

    <!-- Validation Status -->
    <template #advanced-settings>
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
    </template>
  </SpeechProviderSettings>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
