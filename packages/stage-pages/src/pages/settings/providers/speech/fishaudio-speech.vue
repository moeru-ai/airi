<script setup lang="ts">
import type { SpeechProvider } from '@xsai-ext/providers/utils'

import {
  SpeechPlayground,
  SpeechProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { FieldCombobox } from '@proj-airi/ui'
import { useDebounceFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'

// eslint-disable-next-line no-console
console.log('--- Script Setup Executing ---')

interface FishAudioProviderConfig {
  apiKey?: string
  baseUrl?: string
  model?: string
  voice?: string
}

const speechStore = useSpeechStore()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore)

const providerId = 'fishaudio-speech'
const defaultModel = 's2-pro'

function ensureProviderConfig(): FishAudioProviderConfig {
  if (!providers.value[providerId]) {
    providers.value[providerId] = {}
  }

  return providers.value[providerId] as FishAudioProviderConfig
}

const config = computed(() => providers.value[providerId] as FishAudioProviderConfig | undefined)

const model = computed({
  get: () => config.value?.model || defaultModel,
  set: (value: string) => {
    ensureProviderConfig().model = value
  },
})

const voice = computed({
  get: () => config.value?.voice || '',
  set: (value: string) => {
    ensureProviderConfig().voice = value
  },
})

const providerModels = computed(() => {
  return providersStore.getModelsForProvider(providerId)
})

const voiceSearchTerm = ref('')
const voiceOptions = ref<{ value: string, label: string }[]>([])

const modelOptions = computed(() => {
  return providerModels.value.map(model => ({
    value: model.id,
    label: model.name,
  }))
})

const availableVoices = computed(() => {
  return speechStore.availableVoices[providerId] || []
})

const isLoadingModels = computed(() => {
  return providersStore.isLoadingModels[providerId] || false
})
const isLoadingVoices = ref(false)

const apiKeyConfigured = computed(() => !!config.value?.apiKey)
const apiKey = computed(() => config.value?.apiKey?.trim() || '')

function syncSelectedVoice() {
  const firstVoice = voiceOptions.value[0]
  const hasSelectedVoice = voiceOptions.value.some(item => item.value === voice.value)
  if ((!voice.value || !hasSelectedVoice) && firstVoice) {
    voice.value = firstVoice.value
  }
  else if (!firstVoice && voice.value) {
    voice.value = ''
  }
}

async function loadVoiceOptions(searchTerm: string) {
  if (!apiKey.value) {
    voiceOptions.value = []
    syncSelectedVoice()
    return
  }

  isLoadingVoices.value = true
  try {
    const providerMetadata = providersStore.getProviderMetadata(providerId)
    const providerConfig = providersStore.getProviderConfig(providerId)
    const voices = await providerMetadata.capabilities.listVoices?.({
      ...providerConfig,
      searchTerm,
    }) || []

    voiceOptions.value = voices.map(voice => ({
      value: voice.id,
      label: voice.name,
    }))
    syncSelectedVoice()
  }
  finally {
    isLoadingVoices.value = false
  }
}

const debouncedLoadVoiceOptions = useDebounceFn((searchTerm: string) => {
  void loadVoiceOptions(searchTerm)
}, 300)

function toSearchQuery(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  const target = typeof value === 'object' && value !== null && 'target' in value
    ? Reflect.get(value, 'target')
    : null

  if (target && typeof target === 'object' && 'value' in target) {
    const targetValue = Reflect.get(target, 'value')
    return typeof targetValue === 'string' ? targetValue : ''
  }

  return ''
}

function handleVoiceSearch(event: unknown) {
  const query = toSearchQuery(event)
  // eslint-disable-next-line no-console
  console.log('Searching for:', query)
  voiceSearchTerm.value = query
  void debouncedLoadVoiceOptions(query)
}

async function loadProviderDiscoveryData() {
  await providersStore.fetchModelsForProvider(providerId)

  const providerConfig = providersStore.getProviderConfig(providerId)
  const providerMetadata = providersStore.getProviderMetadata(providerId)
  const validationResult = await providerMetadata.validators.validateProviderConfig(providerConfig)
  if (!validationResult.valid) {
    speechStore.availableVoices[providerId] = []
    if (voice.value) {
      voice.value = ''
    }
    return
  }

  await speechStore.loadVoicesForProvider(providerId)
  await providersStore.validateProvider(providerId, { force: true })
}

onMounted(async () => {
  // eslint-disable-next-line no-console
  console.log('--- Fish Audio Page Mounted ---')
  // eslint-disable-next-line no-console
  console.log('Component Mounted')

  ensureProviderConfig()

  if (!config.value?.model) {
    model.value = defaultModel
  }

  await providersStore.loadModelsForConfiguredProviders()
  await loadProviderDiscoveryData()
  handleVoiceSearch('')
})

watch(apiKey, async (newApiKey, previousApiKey) => {
  if (!newApiKey) {
    speechStore.availableVoices[providerId] = []
    voiceOptions.value = []
    if (voice.value) {
      voice.value = ''
    }
    return
  }

  if (newApiKey === previousApiKey) {
    return
  }

  await speechStore.loadVoicesForProvider(providerId)
  await providersStore.validateProvider(providerId, { force: true })
  handleVoiceSearch(voiceSearchTerm.value)
})

async function handleGenerateSpeech(input: string, voiceId: string, _useSSML: boolean) {
  const provider = await providersStore.getProviderInstance<SpeechProvider<string>>(providerId)
  if (!provider) {
    throw new Error('Failed to initialize speech provider')
  }

  const providerConfig = providersStore.getProviderConfig(providerId)
  const modelToUse = model.value || defaultModel
  const voiceToUse = voiceId || voice.value

  return await speechStore.speech(
    provider,
    modelToUse,
    input,
    voiceToUse,
    providerConfig,
  )
}
</script>

<template>
  <SpeechProviderSettings :provider-id="providerId" :default-model="defaultModel">
    <template #voice-settings>
      <FieldCombobox
        v-model="model"
        label="Model"
        description="Select the Fish Audio speech model to use for synthesis"
        :options="modelOptions"
        :disabled="isLoadingModels || modelOptions.length === 0"
        placeholder="Select a model..."
      />
    </template>

    <template #playground>
      <SpeechPlayground
        v-model:selected-voice="voice"
        :available-voices="availableVoices"
        :generate-speech="handleGenerateSpeech"
        :hide-voice-selection="true"
        :api-key-configured="apiKeyConfigured"
        default-text="Hello! This is a test of the Fish Audio speech synthesis."
      >
        <template #before-actions>
          <FieldCombobox
            v-model="voice"
            v-model:search-term="voiceSearchTerm"
            label="Voice"
            description="Select the Fish Audio reference voice to use by default"
            :options="voiceOptions"
            :disabled="!apiKeyConfigured || isLoadingVoices"
            placeholder="Search Fish Audio voices..."
            @search="handleVoiceSearch"
            @update:search-value="handleVoiceSearch"
            @input="handleVoiceSearch"
          />
        </template>
      </SpeechPlayground>
    </template>
  </SpeechProviderSettings>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
