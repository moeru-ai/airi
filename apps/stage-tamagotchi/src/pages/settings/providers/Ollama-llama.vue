<script setup lang="ts">
import type { ChatProvider } from '@xsai-ext/shared-providers'

import {
  ProviderAdvancedSettings,
  ProviderBaseUrlInput,
  ProviderBasicSettings,
  ProviderSettingsContainer,
  ProviderSettingsLayout,
} from '@proj-airi/stage-ui/components'
import { useProvidersStore } from '@proj-airi/stage-ui/stores'
import { FieldSelect } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import OllamaModelDownloader from '@proj-airi/stage-ui/components/Scenarios/Providers/OllamaModelDownloader.vue'

const router = useRouter()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore)

const providerId = 'ollama-llama'
const defaultModel = 'Meta-Llama-3-8B-Instruct.Q4_K_M.gguf'

const llamaModels = [
  { label: '🌟 LLaMA 3 8B Instruct Q4_K_M (4.9 GB) - Рекомендуется', value: 'Meta-Llama-3-8B-Instruct.Q4_K_M.gguf' },
]

const selectedModel = computed({
  get: () => providers.value[providerId]?.model as string | undefined || defaultModel,
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}

    providers.value[providerId].model = value
  },
})

const providerMetadata = computed(() => providersStore.getProviderMetadata(providerId))

const baseUrl = computed({
  get: () => providers.value[providerId]?.baseUrl || providerMetadata.value?.defaultOptions?.().baseUrl || '',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}

    providers.value[providerId].baseUrl = value
  },
})

const isConfigured = computed(() => !!providers.value[providerId]?.model && !!providers.value[providerId]?.baseUrl)

function handleResetSettings() {
  providers.value[providerId] = {
    ...(providerMetadata.value?.defaultOptions?.() as any),
  }
}

function handleModelDownloaded(modelName: string) {
  // Refresh the available models after download
  console.warn(`Model ${modelName} downloaded successfully`)
  // You could add logic here to refresh the model list or show a success message
}

onMounted(() => {
  providersStore.initializeProvider(providerId)

  baseUrl.value = providers.value[providerId]?.baseUrl || providerMetadata.value?.defaultOptions?.().baseUrl || ''
})
</script>

<template>
  <ProviderSettingsLayout
    :provider-name="providerMetadata?.localizedName"
    :provider-icon="providerMetadata?.icon"
    :on-back="() => $router.back()"
  >
    <ProviderSettingsContainer>
      <ProviderBasicSettings
        title="Basic Settings"
        description="Configure Ollama server and select LLaMA model"
        :on-reset="handleResetSettings"
      >
        <ProviderBaseUrlInput
          v-model="baseUrl"
          :placeholder="providerMetadata?.defaultOptions?.().baseUrl as string || ''"
          required
        />
        
        <FieldSelect
          v-model="selectedModel"
          label="LLaMA Model"
          description="Select LLaMA model for chat. Larger models are more capable but require more memory."
          :options="llamaModels"
          layout="vertical"
        />
      </ProviderBasicSettings>
      
      <!-- Model Downloader Section -->
      <div v-if="baseUrl" class="mt-6">
        <OllamaModelDownloader
          :base-url="baseUrl.replace('/v1/', '')"
          @model-downloaded="handleModelDownloaded"
        />
      </div>
    </ProviderSettingsContainer>
  </ProviderSettingsLayout>
</template>

<route lang="yaml">
  meta:
    layout: settings
    stageTransition:
      name: slide
</route>