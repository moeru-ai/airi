<script setup lang="ts">
import type { SpeechProvider } from '@xsai-ext/providers/utils'

import { errorMessageFrom } from '@moeru/std'
import {
  SpeechPlayground,
  SpeechProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { getFishAudioApiKey, searchFishAudioVoices } from '@proj-airi/stage-ui/stores/providers/fishaudio'
import { Button, FieldCombobox } from '@proj-airi/ui'
import { useDebounceFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

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
const { t } = useI18n()

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
const voiceCatalog = ref<'discover' | 'mine'>('mine')
const voicePage = ref(1)
const voiceTotal = ref(0)
const voiceHasMore = ref(false)

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
const voiceSearchError = ref('')
let latestVoiceSearchRequestId = 0

const providerMetadata = computed(() => providersStore.getProviderMetadata(providerId))
const apiKey = computed(() => getFishAudioApiKey(config.value?.apiKey))
const apiKeyConfigured = computed(() => {
  return Boolean(providersStore.configuredProviders[providerId]) && Boolean(apiKey.value)
})

function mergeVoiceOptions(current: { value: string, label: string }[], next: { value: string, label: string }[]) {
  const voicesById = new Map(current.map(voice => [voice.value, voice]))
  for (const voice of next) {
    voicesById.set(voice.value, voice)
  }

  return [...voicesById.values()]
}

async function loadVoiceOptions(searchTerm: string, loadMore = false) {
  if (!apiKey.value) {
    latestVoiceSearchRequestId += 1
    isLoadingVoices.value = false
    voiceSearchError.value = ''
    voiceOptions.value = []
    return
  }

  const requestId = ++latestVoiceSearchRequestId
  const nextPage = loadMore ? voicePage.value + 1 : 1
  isLoadingVoices.value = true
  voiceSearchError.value = ''
  try {
    const providerConfig = providersStore.getProviderConfig(providerId)
    const result = await searchFishAudioVoices({
      apiKey: providerConfig.apiKey,
      baseUrl: providerConfig.baseUrl,
      pageNumber: nextPage,
      pageSize: 20,
      searchTerm,
      self: voiceCatalog.value === 'mine',
      sortBy: searchTerm ? 'score' : 'task_count',
    })

    if (requestId !== latestVoiceSearchRequestId) {
      return
    }

    const mappedVoices = result.items

    const selectedVoiceId = voice.value
    if (selectedVoiceId && !mappedVoices.some(v => v.value === selectedVoiceId)) {
      try {
        const idVoices = await providerMetadata.value.capabilities.listVoices?.(
          providerConfig,
          { id: selectedVoiceId },
        ) || []
        if (idVoices.length > 0) {
          mappedVoices.unshift(...idVoices.map(v => ({
            value: v.id,
            label: v.name,
          })))
        }
      }
      catch (error) {
        console.error('Failed to hydrate selected voice by ID:', error)
      }
    }

    if (requestId !== latestVoiceSearchRequestId) {
      return
    }

    voiceOptions.value = loadMore
      ? mergeVoiceOptions(voiceOptions.value, mappedVoices)
      : mappedVoices
    voicePage.value = result.pageNumber
    voiceTotal.value = result.total
    voiceHasMore.value = result.hasMore
  }
  catch (error) {
    if (requestId !== latestVoiceSearchRequestId) {
      return
    }

    console.error('Failed to load Fish Audio voices:', error)
    voiceSearchError.value = errorMessageFrom(error) ?? 'Failed to load Fish Audio voices'
    isLoadingVoices.value = false
  }
  finally {
    if (requestId === latestVoiceSearchRequestId) {
      isLoadingVoices.value = false
    }
  }
}

const debouncedLoadVoiceOptions = useDebounceFn((searchTerm: string) => {
  void loadVoiceOptions(searchTerm)
}, 300)

function switchVoiceCatalog(catalog: 'discover' | 'mine') {
  if (voiceCatalog.value === catalog) {
    return
  }

  voiceCatalog.value = catalog
  void loadVoiceOptions(voiceSearchTerm.value)
}

function loadMoreVoices() {
  if (!voiceHasMore.value || isLoadingVoices.value) {
    return
  }

  void loadVoiceOptions(voiceSearchTerm.value, true)
}

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
  const validationResult = await providerMetadata.value.validators.validateProviderConfig(providerConfig)
  if (!validationResult.valid) {
    speechStore.availableVoices[providerId] = []
    voiceOptions.value = []
    return
  }

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
    latestVoiceSearchRequestId += 1
    isLoadingVoices.value = false
    voiceSearchError.value = ''
    speechStore.availableVoices[providerId] = []
    voiceOptions.value = []
    providersStore.setProviderUnconfigured(providerId)
    return
  }

  if (newApiKey === previousApiKey) {
    return
  }

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
        audio-mime-type="audio/mpeg"
        :generate-speech="handleGenerateSpeech"
        :hide-voice-selection="true"
        :api-key-configured="apiKeyConfigured"
        default-text="Hello! This is a test of the Fish Audio speech synthesis."
      >
        <template #before-actions>
          <div :class="['flex', 'items-center', 'gap-2']">
            <Button
              size="sm"
              :variant="voiceCatalog === 'mine' ? 'primary' : 'secondary-muted'"
              :disabled="!apiKeyConfigured"
              @click="switchVoiceCatalog('mine')"
            >
              {{ t('settings.pages.providers.provider.fishaudio-speech.voice_browser.my_voices') }}
            </Button>
            <Button
              size="sm"
              :variant="voiceCatalog === 'discover' ? 'primary' : 'secondary-muted'"
              :disabled="!apiKeyConfigured"
              @click="switchVoiceCatalog('discover')"
            >
              {{ t('settings.pages.providers.provider.fishaudio-speech.voice_browser.discover_voices') }}
            </Button>
          </div>
          <FieldCombobox
            v-model="voice"
            v-model:search-term="voiceSearchTerm"
            label="Voice"
            :description="voiceCatalog === 'mine'
              ? t('settings.pages.providers.provider.fishaudio-speech.voice_browser.mine_description')
              : t('settings.pages.providers.provider.fishaudio-speech.voice_browser.discover_description')"
            :options="voiceOptions"
            :disabled="!apiKeyConfigured"
            placeholder="Search Fish Audio voices..."
            @search="handleVoiceSearch"
            @update:search-value="handleVoiceSearch"
            @input="handleVoiceSearch"
          >
            <template #label>
              <div :class="['flex', 'items-center', 'gap-2']">
                <span>Voice</span>
                <span v-if="isLoadingVoices" :class="['i-lucide:loader-2', 'animate-spin', 'text-neutral-400']" />
              </div>
            </template>
          </FieldCombobox>
          <p v-if="voiceSearchError" class="text-sm text-red-500">
            {{ voiceSearchError }}
          </p>
          <div v-else-if="apiKeyConfigured" :class="['flex', 'items-center', 'justify-between', 'gap-3', 'text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
            <span>
              {{ t('settings.pages.providers.provider.fishaudio-speech.voice_browser.showing_results', {
                count: voiceOptions.length,
                total: voiceTotal,
              }) }}
            </span>
            <Button
              v-if="voiceHasMore"
              size="sm"
              variant="secondary"
              :disabled="isLoadingVoices"
              @click="loadMoreVoices"
            >
              {{ t('settings.pages.providers.provider.fishaudio-speech.voice_browser.load_more') }}
            </Button>
          </div>
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
