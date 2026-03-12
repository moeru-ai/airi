<script setup lang="ts">
import type { FishAudioSearchParams, FishAudioVoiceInfo } from '@proj-airi/stage-ui/stores/providers/fish-audio'
import type { SpeechProvider } from '@xsai-ext/providers/utils'

import {
  SpeechPlayground,
  SpeechProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { searchFishAudioVoices } from '@proj-airi/stage-ui/stores/providers/fish-audio'
import { FieldInput, FieldRange, FieldSelect } from '@proj-airi/ui'
import { useDebounceFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const providerId = 'fish-audio'
const defaultModel = 's2-pro'

const speechStore = useSpeechStore()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore)
const { t } = useI18n()

const temperature = ref<number>(0.7)
const topP = ref<number>(0.7)

const apiKeyConfigured = computed(() => !!providers.value[providerId]?.apiKey)

const referenceId = computed({
  get: () => providers.value[providerId]?.referenceId as string || '',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].referenceId = value
  },
})

const model = computed({
  get: () => providers.value[providerId]?.model as string || defaultModel,
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].model = value
  },
})

// Voice browser state
const searchQuery = ref('')
const searchLanguage = ref('')
const searchSortBy = ref<'score' | 'task_count' | 'created_at'>('score')
const searchResults = ref<FishAudioVoiceInfo[]>([])
const searchTotal = ref(0)
const searchPage = ref(1)
const searchPageSize = 12
const isSearching = ref(false)
const searchError = ref('')

const totalPages = computed(() => Math.max(1, Math.ceil(searchTotal.value / searchPageSize)))

const languageOptions = [
  { value: '', label: 'All Languages' },
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'pt', label: 'Português' },
  { value: 'ru', label: 'Русский' },
]

const sortByOptions = [
  { value: 'score', label: t('settings.pages.providers.provider.fish-audio.voice-browser.sort.score') },
  { value: 'task_count', label: t('settings.pages.providers.provider.fish-audio.voice-browser.sort.task-count') },
  { value: 'created_at', label: t('settings.pages.providers.provider.fish-audio.voice-browser.sort.created-at') },
]

async function performSearch() {
  const apiKey = providers.value[providerId]?.apiKey as string
  if (!apiKey) {
    searchError.value = 'API key is required to browse voices.'
    return
  }

  isSearching.value = true
  searchError.value = ''

  try {
    const params: FishAudioSearchParams = {
      pageSize: searchPageSize,
      pageNumber: searchPage.value,
      sortBy: searchSortBy.value,
    }

    if (searchQuery.value.trim())
      params.title = searchQuery.value.trim()

    if (searchLanguage.value)
      params.language = searchLanguage.value

    const baseUrl = providers.value[providerId]?.baseUrl as string | undefined
    const result = await searchFishAudioVoices(apiKey, params, baseUrl)
    searchResults.value = result.items
    searchTotal.value = result.total
  }
  catch (err) {
    searchError.value = err instanceof Error ? err.message : 'Search failed'
  }
  finally {
    isSearching.value = false
  }
}

const debouncedSearch = useDebounceFn(() => {
  searchPage.value = 1
  performSearch()
}, 400)

watch([searchLanguage, searchSortBy], () => {
  searchPage.value = 1
  performSearch()
})

watch(searchQuery, () => {
  debouncedSearch()
})

function selectVoice(voice: FishAudioVoiceInfo) {
  referenceId.value = voice.id
}

function goToPage(page: number) {
  if (page >= 1 && page <= totalPages.value) {
    searchPage.value = page
    performSearch()
  }
}

const availableVoices = computed(() => {
  return speechStore.availableVoices[providerId] || []
})

async function handleGenerateSpeech(input: string, voiceId: string, _useSSML: boolean) {
  const provider = await providersStore.getProviderInstance<SpeechProvider>(providerId)
  if (!provider)
    throw new Error('Failed to initialize speech provider')

  const providerConfig = providersStore.getProviderConfig(providerId)
  const modelToUse = providerConfig.model as string || defaultModel

  return await speechStore.speech(provider, modelToUse, input, voiceId, {
    ...providerConfig,
  })
}

onMounted(async () => {
  providersStore.initializeProvider(providerId)
  const providerConfig = providersStore.getProviderConfig(providerId)
  temperature.value = (providerConfig?.temperature as number) ?? 0.7
  topP.value = (providerConfig?.topP as number) ?? 0.7

  const providerMetadata = providersStore.getProviderMetadata(providerId)
  if (await providerMetadata.validators.validateProviderConfig(providerConfig)) {
    await speechStore.loadVoicesForProvider(providerId)
    performSearch()
  }
})

watch(temperature, () => {
  const config = providersStore.getProviderConfig(providerId)
  config.temperature = temperature.value
})

watch(topP, () => {
  const config = providersStore.getProviderConfig(providerId)
  config.topP = topP.value
})

watch(providers, async () => {
  const providerConfig = providersStore.getProviderConfig(providerId)
  const providerMetadata = providersStore.getProviderMetadata(providerId)
  if (await providerMetadata.validators.validateProviderConfig(providerConfig)) {
    await speechStore.loadVoicesForProvider(providerId)
    if (searchResults.value.length === 0)
      performSearch()
  }
}, { immediate: true })
</script>

<template>
  <SpeechProviderSettings
    :provider-id="providerId"
    :default-model="defaultModel"
    placeholder="sk-..."
  >
    <template #basic-settings>
      <div flex="~ col gap-4">
        <FieldSelect
          v-model="model"
          :label="t('settings.pages.providers.provider.fish-audio.fields.field.model.label')"
          :description="t('settings.pages.providers.provider.fish-audio.fields.field.model.description')"
          :options="[
            { value: 's2-pro', label: 'S2 Pro' },
            { value: 's1', label: 'S1' },
          ]"
        />
        <FieldInput
          v-model="referenceId"
          :label="t('settings.pages.providers.provider.fish-audio.fields.field.reference-id.label')"
          :description="t('settings.pages.providers.provider.fish-audio.fields.field.reference-id.description')"
          placeholder="e.g. a1b2c3d4..."
        />
      </div>
    </template>

    <template #voice-settings>
      <div flex="~ col gap-4">
        <FieldRange
          v-model="temperature"
          label="Temperature"
          description="Controls randomness of the voice generation"
          :min="0" :max="1" :step="0.01"
        />
        <FieldRange
          v-model="topP"
          label="Top P"
          description="Controls diversity of the voice generation"
          :min="0" :max="1" :step="0.01"
        />
      </div>
    </template>

    <template #playground>
      <!-- Voice Browser Section -->
      <div flex="~ col gap-4" class="mb-6">
        <h2 :class="['text-lg md:text-2xl', 'text-neutral-500 dark:text-neutral-400']">
          {{ t('settings.pages.providers.provider.fish-audio.voice-browser.title') }}
        </h2>

        <!-- Search / Filter bar -->
        <div flex="~ row gap-3 wrap">
          <div class="min-w-0 flex-1">
            <input
              v-model="searchQuery"
              type="text"
              :placeholder="t('settings.pages.providers.provider.fish-audio.voice-browser.search-placeholder')"
              :class="[
                'w-full rounded-lg px-3 py-2 text-sm outline-none',
                'border-2 border-solid border-neutral-200 dark:border-neutral-700',
                'bg-neutral-100 dark:bg-neutral-800',
                'focus:border-neutral-300 dark:focus:border-neutral-600',
                'transition-all duration-200',
              ]"
            >
          </div>
          <FieldSelect
            v-model="searchLanguage"
            label=""
            :options="languageOptions"
            :class="['w-32']"
          />
          <FieldSelect
            v-model="searchSortBy"
            label=""
            :options="sortByOptions"
            :class="['w-36']"
          />
        </div>

        <!-- Loading / Error states -->
        <div v-if="isSearching" :class="['flex items-center justify-center py-8', 'text-neutral-400']">
          <div class="i-svg-spinners:ring-resize mr-2 h-5 w-5" />
          {{ t('settings.pages.providers.provider.fish-audio.voice-browser.loading') }}
        </div>
        <div v-else-if="searchError" :class="['rounded-lg px-4 py-3 text-sm', 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400']">
          {{ searchError }}
        </div>
        <div v-else-if="!apiKeyConfigured" :class="['rounded-lg px-4 py-3 text-sm', 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400']">
          {{ t('settings.pages.providers.provider.fish-audio.voice-browser.api-key-required') }}
        </div>

        <!-- Voice Grid -->
        <div
          v-if="!isSearching && searchResults.length > 0"
          :class="['grid gap-3', 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3']"
        >
          <button
            v-for="voice in searchResults" :key="voice.id"
            :class="[
              'flex cursor-pointer flex-col gap-2 rounded-xl border-2 border-solid p-3 text-left',
              'transition-all duration-200',
              voice.id === referenceId
                ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/20'
                : 'border-neutral-200 bg-neutral-50 hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-800/50 dark:hover:border-neutral-600',
            ]"
            @click="selectVoice(voice)"
          >
            <div flex="~ row gap-3" items-start>
              <!-- Cover image -->
              <div
                :class="[
                  'h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg',
                  'bg-neutral-200 dark:bg-neutral-700',
                ]"
              >
                <img
                  v-if="voice.coverImage"
                  :src="voice.coverImage"
                  :alt="voice.title"
                  class="h-full w-full object-cover"
                  loading="lazy"
                >
                <div
                  v-else
                  :class="['h-full w-full flex items-center justify-center', 'text-neutral-400 dark:text-neutral-500']"
                >
                  <div class="i-solar:microphone-bold-duotone h-6 w-6" />
                </div>
              </div>

              <div class="min-w-0 flex-1">
                <!-- Title -->
                <div :class="['truncate text-sm font-medium', 'text-neutral-800 dark:text-neutral-200']">
                  {{ voice.title }}
                </div>
                <!-- Author -->
                <div
                  v-if="voice.author"
                  :class="['truncate text-xs', 'text-neutral-500 dark:text-neutral-400']"
                >
                  {{ voice.author.name }}
                </div>
              </div>

              <!-- Selected indicator -->
              <div
                v-if="voice.id === referenceId"
                :class="['flex-shrink-0 text-blue-500 dark:text-blue-400']"
              >
                <div class="i-solar:check-circle-bold h-5 w-5" />
              </div>
            </div>

            <!-- Tags -->
            <div v-if="voice.tags && voice.tags.length > 0" flex="~ row gap-1 wrap">
              <span
                v-for="tag in voice.tags.slice(0, 3)" :key="tag"
                :class="[
                  'rounded-full px-2 py-0.5 text-xs',
                  'bg-neutral-200/60 text-neutral-600 dark:bg-neutral-700/60 dark:text-neutral-300',
                ]"
              >
                {{ tag }}
              </span>
              <span
                v-if="voice.tags.length > 3"
                :class="['text-xs text-neutral-400']"
              >
                +{{ voice.tags.length - 3 }}
              </span>
            </div>

            <!-- Languages & stats -->
            <div flex="~ row gap-2" :class="['text-xs text-neutral-400 dark:text-neutral-500']">
              <span v-if="voice.languages && voice.languages.length > 0">
                {{ voice.languages.join(', ') }}
              </span>
              <span v-if="voice.taskCount != null" :class="['flex items-center gap-0.5']">
                <div class="i-solar:play-circle-linear h-3 w-3" />
                {{ voice.taskCount.toLocaleString() }}
              </span>
              <span v-if="voice.likeCount != null" :class="['flex items-center gap-0.5']">
                <div class="i-solar:heart-linear h-3 w-3" />
                {{ voice.likeCount.toLocaleString() }}
              </span>
            </div>
          </button>
        </div>

        <!-- Empty state -->
        <div
          v-if="!isSearching && !searchError && apiKeyConfigured && searchResults.length === 0"
          :class="['py-8 text-center text-sm', 'text-neutral-400 dark:text-neutral-500']"
        >
          {{ t('settings.pages.providers.provider.fish-audio.voice-browser.no-results') }}
        </div>

        <!-- Pagination -->
        <div
          v-if="totalPages > 1"
          flex="~ row gap-2" items-center justify-center class="pt-2"
        >
          <button
            :disabled="searchPage <= 1"
            :class="[
              'rounded-lg px-3 py-1.5 text-sm',
              'border border-solid border-neutral-200 dark:border-neutral-700',
              searchPage <= 1 ? 'cursor-not-allowed opacity-40' : 'cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800',
            ]"
            @click="goToPage(searchPage - 1)"
          >
            ←
          </button>
          <span :class="['text-sm', 'text-neutral-500 dark:text-neutral-400']">
            {{ searchPage }} / {{ totalPages }}
          </span>
          <button
            :disabled="searchPage >= totalPages"
            :class="[
              'rounded-lg px-3 py-1.5 text-sm',
              'border border-solid border-neutral-200 dark:border-neutral-700',
              searchPage >= totalPages ? 'cursor-not-allowed opacity-40' : 'cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800',
            ]"
            @click="goToPage(searchPage + 1)"
          >
            →
          </button>
          <span :class="['text-xs', 'text-neutral-400 dark:text-neutral-500']">
            ({{ searchTotal }} {{ t('settings.pages.providers.provider.fish-audio.voice-browser.total-voices') }})
          </span>
        </div>
      </div>

      <!-- Speech Playground -->
      <SpeechPlayground
        :available-voices="availableVoices"
        :generate-speech="handleGenerateSpeech"
        :api-key-configured="apiKeyConfigured"
        default-text="你好！这是一段 Fish Audio 语音合成测试。"
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
