<script setup lang="ts">
import type { SpeechProvider } from '@xsai-ext/providers/utils'

import {
  SpeechPlayground,
  SpeechProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { getDefaultKokoroModel } from '@proj-airi/stage-ui/workers/kokoro/constants'
import { Callout, Select } from '@proj-airi/ui'
import { computed, onMounted, ref, watch } from 'vue'
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

// Track voices loading state
const voicesLoading = ref(false)

// Get provider models from store
const providerModels = computed(() => {
  return providersStore.getModelsForProvider(providerId)
})

// Model loading state
const modelsLoading = computed(() => {
  return providersStore.isLoadingModels[providerId] || false
})

// Model computed property
const model = computed({
  get(): string {
    const currentValue = providerConfig.value?.model as string
    if (currentValue)
      return currentValue

    return getDefaultKokoroModel(hasWebGPU.value)
  },
  set(val: string) {
    const config = providersStore.getProviderConfig(providerId)
    config.model = val
  },
})

// Model options for the dropdown
const modelOptions = computed(() => {
  return providerModels.value.map(m => ({
    label: m.name,
    value: m.id,
  }))
})

// Generate speech with Kokoro-specific parameters
async function handleGenerateSpeech(input: string, voiceId: string, _useSSML: boolean) {
  try {
    console.log('[Kokoro Playground] Generating speech:', { input, voiceId, model: model.value })

    const provider = await providersStore.getProviderInstance(providerId) as SpeechProvider
    if (!provider) {
      console.error('[Kokoro Playground] Failed to get provider instance')
      throw new Error('Failed to initialize speech provider')
    }

    const config = providersStore.getProviderConfig(providerId)
    const selectedModel = config.model as string | undefined || defaultModel

    console.log('[Kokoro Playground] Using config:', { model: selectedModel, config })

    const result = await speechStore.speech(
      provider,
      selectedModel,
      input,
      voiceId,
      {
        ...config,
      },
    )

    console.log('[Kokoro Playground] Speech generated successfully, buffer size:', result.byteLength)

    return result
  }
  catch (error) {
    console.error('[Kokoro Playground] Error generating speech:', error)
    throw error
  }
}

onMounted(async () => {
  // Check WebGPU support
  hasWebGPU.value = typeof navigator !== 'undefined' && !!navigator.gpu

  try {
    voicesLoading.value = true

    // Fetch available models first
    await providersStore.fetchModelsForProvider(providerId)

    const config = providersStore.getProviderConfig(providerId)
    const metadata = providersStore.getProviderMetadata(providerId)
    const validationResult = await metadata.validators.validateProviderConfig(config)
    if (validationResult.valid) {
      // Load the initial model
      if (metadata.capabilities.loadModel) {
        await metadata.capabilities.loadModel(config, {
          onProgress: async (progress) => {
            console.log('[Kokoro Settings] Initial load progress:', progress)
          },
        })
      }

      await speechStore.loadVoicesForProvider(providerId)
    }
    else {
      console.error('Failed to validate Kokoro provider config', config, validationResult)
    }
  }
  finally {
    voicesLoading.value = false
  }
})

// Watch for model changes and reload model + voices
watch(model, async (newValue) => {
  if (newValue) {
    try {
      console.log('[Kokoro Settings] Model selected:', { model: newValue })

      voicesLoading.value = true

      const config = providersStore.getProviderConfig(providerId)
      const metadata = providersStore.getProviderMetadata(providerId)
      const validationResult = await metadata.validators.validateProviderConfig(config)

      console.log('[Kokoro Settings] Validation result:', validationResult)

      if (validationResult.valid && metadata.capabilities.loadModel) {
        // Load the model using the capability with progress tracking
        await metadata.capabilities.loadModel(config, {
          onProgress: async (progress) => {
            console.log('[Kokoro Settings] Loading progress:', progress)
          },
        })

        console.log('[Kokoro Settings] Model loaded, reloading voices')

        // Then reload voices
        await speechStore.loadVoicesForProvider(providerId)

        console.log('[Kokoro Settings] Voices reloaded successfully')
      }
    }
    catch (error) {
      console.error('[Kokoro Settings] Error in model watcher:', error)
    }
    finally {
      voicesLoading.value = false
    }
  }
})
</script>

<template>
  <SpeechProviderSettings
    :provider-id="providerId"
    :default-model="defaultModel"
  >
    <template #voice-settings>
      <!-- Model Selection -->
      <div class="space-y-3">
        <Callout :label="t('settings.pages.providers.provider.kokoro-local.fields.field.model.label')">
          <div>
            <p>{{ t('settings.pages.providers.provider.kokoro-local.fields.field.model.description') }}</p>
          </div>
        </Callout>
        <div>
          <Select
            v-model="model"
            :options="modelOptions"
            :disabled="modelsLoading"
            placeholder="Choose a model..."
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
        :voices-loading="voicesLoading"
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
