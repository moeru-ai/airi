<script setup lang="ts">
import type { SpeechProvider } from '@xsai-ext/providers/utils'

import {
  SpeechPlayground,
  SpeechProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const providerId = 'kokoro-local'
const defaultModel = 'kokoro-82m'
const speechStore = useSpeechStore()
const providersStore = useProvidersStore()
const { t } = useI18n()

// Get available voices for Kokoro
const availableVoices = computed(() => {
  return speechStore.availableVoices[providerId] || []
})

// Get provider config
const providerConfig = computed(() => {
  return providersStore.getProviderConfig(providerId)
})

// Check if WebGPU is supported
const hasWebGPU = ref(false)

// Quantization model
const quantization = computed({
  get: () => providerConfig.value?.quantization || 'q4f16',
  set: (val) => {
    const config = providersStore.getProviderConfig(providerId)
    config.quantization = val
  },
})

// Generate speech with Kokoro-specific parameters
async function handleGenerateSpeech(input: string, voiceId: string, _useSSML: boolean) {
  const provider = await providersStore.getProviderInstance(providerId) as SpeechProvider
  if (!provider) {
    throw new Error('Failed to initialize speech provider')
  }

  const config = providersStore.getProviderConfig(providerId)
  const model = config.model as string | undefined || defaultModel

  return await speechStore.speech(
    provider,
    model,
    input,
    voiceId,
    {
      ...config,
    },
  )
}

onMounted(async () => {
  // Check WebGPU support
  hasWebGPU.value = typeof navigator !== 'undefined' && !!navigator.gpu

  const config = providersStore.getProviderConfig(providerId)
  const metadata = providersStore.getProviderMetadata(providerId)
  const validationResult = await metadata.validators.validateProviderConfig(config)
  if (validationResult.valid) {
    await speechStore.loadVoicesForProvider(providerId)
  }
  else {
    console.error('Failed to validate Kokoro provider config', config, validationResult)
  }
})
</script>

<template>
  <SpeechProviderSettings
    :provider-id="providerId"
    :default-model="defaultModel"
  >
    <template #voice-settings>
      <!-- Quantization Selection -->
      <div class="space-y-3">
        <div>
          <label class="mb-2 block text-sm font-medium">
            {{ t('settings.pages.providers.provider.kokoro-local.fields.field.quantization.label') }}
          </label>
          <select
            v-model="quantization"
            class="w-full border rounded bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
          >
            <option v-if="hasWebGPU" value="fp32-webgpu">
              {{ t('settings.pages.providers.provider.kokoro-local.fields.field.quantization.options.fp32-webgpu') }}
            </option>
            <option value="q4f16">
              {{ t('settings.pages.providers.provider.kokoro-local.fields.field.quantization.options.q4f16') }}
            </option>
            <option value="q4">
              {{ t('settings.pages.providers.provider.kokoro-local.fields.field.quantization.options.q4') }}
            </option>
            <option value="q8">
              {{ t('settings.pages.providers.provider.kokoro-local.fields.field.quantization.options.q8') }}
            </option>
            <option value="fp16">
              {{ t('settings.pages.providers.provider.kokoro-local.fields.field.quantization.options.fp16') }}
            </option>
            <option value="fp32">
              {{ t('settings.pages.providers.provider.kokoro-local.fields.field.quantization.options.fp32') }}
            </option>
          </select>
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {{ t('settings.pages.providers.provider.kokoro-local.fields.field.quantization.description') }}
          </p>
        </div>

        <!-- Info Box -->
        <div class="border border-blue-200 rounded bg-blue-50 p-3 text-sm dark:border-blue-800 dark:bg-blue-900/20">
          <p class="mb-2 font-medium">
            {{ t('settings.pages.providers.provider.kokoro-local.info.title') }}
          </p>
          <ul class="list-disc list-inside text-xs text-gray-700 space-y-1 dark:text-gray-300">
            <li>{{ t('settings.pages.providers.provider.kokoro-local.info.voices') }}</li>
            <li>{{ t('settings.pages.providers.provider.kokoro-local.info.offline') }}</li>
            <li>{{ t('settings.pages.providers.provider.kokoro-local.info.download') }}</li>
            <li>{{ t('settings.pages.providers.provider.kokoro-local.info.cache') }}</li>
          </ul>
        </div>
      </div>
    </template>

    <!-- Replace the default playground with our standalone component -->
    <template #playground>
      <SpeechPlayground
        :available-voices="availableVoices"
        :generate-speech="handleGenerateSpeech"
        :api-key-configured="true"
        :default-text="t('settings.pages.providers.provider.kokoro-local.playground.default-text')"
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
