<script setup lang="ts">
import type { SpeechProvider } from '@xsai-ext/providers/utils'

import {
  SpeechPlayground,
  SpeechProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { KOKORO_MODELS } from '@proj-airi/stage-ui/workers/kokoro/constants'
import { Callout, Select } from '@proj-airi/ui'
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
  get(): string {
    return (providerConfig.value?.quantization as string) || 'q4f16'
  },
  set(val: string) {
    const config = providersStore.getProviderConfig(providerId)
    config.quantization = val
  },
})

// Quantization options (filtered by platform support)
const quantizationOptions = computed(() => {
  return KOKORO_MODELS
    .filter(model => model.platform === 'wasm' || (model.platform === 'webgpu' && hasWebGPU.value))
    .map(model => ({
      label: t(`settings.pages.providers.provider.kokoro-local.fields.field.quantization.options.${model.id}`),
      value: model.id,
    }))
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
        <Callout :label="t('settings.pages.providers.provider.kokoro-local.fields.field.quantization.label')">
          <div>
            <p>{{ t('settings.pages.providers.provider.kokoro-local.fields.field.quantization.description') }}</p>
            <p>{{ t('settings.pages.providers.provider.kokoro-local.fields.field.quantization.download') }}</p>
          </div>
        </Callout>
        <div>
          <Select
            v-model="quantization"
            :options="quantizationOptions"
            placeholder="Choose an option..."
          />
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
