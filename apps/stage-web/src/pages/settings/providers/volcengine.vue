<script setup lang="ts">
import type { SpeechProviderWithExtraOptions } from '@xsai-ext/shared-providers'

import {
  SpeechPlayground,
  SpeechProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { FieldInput, FieldRange } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const providerId = 'volcengine'
const defaultModel = 'v1'

const speedRatio = ref<number>(1.0)

const speechStore = useSpeechStore()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore)
const { t } = useI18n()

// Additional settings specific to Volcengine (appId)
const appId = computed({
  get: () => (providers.value[providerId]?.app as any)?.appId || '',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}

    providers.value[providerId].app = {
      ...(providers.value[providerId].app || {}),
      appId: value,
    }
  },
})

// Check if API key is configured
const apiKeyConfigured = computed(() => !!providers.value[providerId]?.apiKey)

// Get available voices for Volcengine
const availableVoices = computed(() => {
  return speechStore.availableVoices[providerId] || []
})

// Generate speech with Volcengine-specific parameters
async function handleGenerateSpeech(input: string, voiceId: string, _useSSML: boolean) {
  const provider = await providersStore.getProviderInstance(
    providerId,
  ) as SpeechProviderWithExtraOptions<string, Record<string, any>>
  if (!provider) {
    throw new Error('Failed to initialize speech provider')
  }

  // Get provider configuration
  const providerConfig = providersStore.getProviderConfig(providerId)

  // Get model from configuration or use default
  const model = (providerConfig.model as string | undefined) || defaultModel

  // Volcengine doesn’t need SSML conversion
  return await speechStore.speech(
    provider,
    model,
    input,
    voiceId,
    {
      ...providerConfig,
    },
  )
}

async function validateAndLoadVoices() {
  const providerConfig = providersStore.getProviderConfig(providerId)
  const providerMetadata = providersStore.getProviderMetadata(providerId)
  if (await providerMetadata.validators.validateProviderConfig(providerConfig)) {
    await speechStore.loadVoicesForProvider(providerId)
  }
  else {
    console.error('Failed to validate provider config', providerConfig)
  }
}

onMounted(async () => {
  await validateAndLoadVoices()
})

watch(speedRatio, (val) => {
  const providerConfig = providersStore.getProviderConfig(providerId)
  if (!providerConfig.audio)
    providerConfig.audio = {}

  ;(providerConfig.audio as any).speedRatio = val
})

watch(appId, async () => {
  await validateAndLoadVoices()
}, { immediate: true })
</script>

<template>
  <SpeechProviderSettings
    :provider-id="providerId"
    :default-model="defaultModel"
  >
    <!-- Basic settings specific to Volcengine -->
    <template #basic-settings>
      <div flex="~ col gap-4">
        <FieldInput
          v-model="appId"
          :label="t('settings.pages.providers.provider.volcengine.fields.field.appId.label')"
          :description="t('settings.pages.providers.provider.volcengine.fields.field.appId.description')"
          required
        />
      </div>
    </template>

    <template #voice-settings>
      <!-- Speed control - common to most providers -->
      <FieldRange
        v-model="speedRatio"
        :label="t('settings.pages.providers.provider.common.fields.field.speed.label')"
        :description="t('settings.pages.providers.provider.common.fields.field.speed.description')"
        :min="0.5"
        :max="2.0"
        :step="0.01"
      />
    </template>

    <!-- Replace the default playground with our standalone component -->
    <template #playground>
      <SpeechPlayground
        :available-voices="availableVoices"
        :generate-speech="handleGenerateSpeech"
        :api-key-configured="apiKeyConfigured"
        default-text="Hello! This is a test of the Volcengine voice synthesis."
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
