<script setup lang="ts">
import { Alert, Button, Progress } from '@proj-airi/stage-ui/components'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { getOllamaAPI, POPULAR_OLLAMA_MODELS, type OllamaPullProgress } from '../../../utils/ollama-api-loader'

interface Props {
  baseUrl: string
  headers?: Record<string, string>
}

const props = withDefaults(defineProps<Props>(), {
  headers: () => ({}),
})

const emit = defineEmits<{
  modelDownloaded: [modelName: string]
}>()

const { t } = useI18n()

// State
const selectedModel = ref('')
const isDownloading = ref(false)
const downloadProgress = ref(0)
const downloadStatus = ref('')
const downloadError = ref('')
const abortController = ref<AbortController | null>(null)
const customModelName = ref('')
const showCustomInput = ref(false)

// Reactive API instance
const ollamaApi = ref(null)

// Initialize API
const initializeApi = async () => {
  const api = await getOllamaAPI()
  if (api) {
    api.baseUrl = props.baseUrl
    api.headers = props.headers
  }
  ollamaApi.value = api
}

// Initialize on mount
onMounted(() => {
  initializeApi()
})

const isValidCustomModel = computed(() => {
  return customModelName.value.trim().length > 0 && /^[a-zA-Z0-9._-]+(?::.*)?$/.test(customModelName.value.trim())
})

const canDownload = computed(() => {
  if (showCustomInput.value) {
    return isValidCustomModel.value && !isDownloading.value
  }
  return selectedModel.value && !isDownloading.value
})

const modelToDownload = computed(() => {
  return showCustomInput.value ? customModelName.value.trim() : selectedModel.value
})

// Methods
function resetDownloadState() {
  downloadProgress.value = 0
  downloadStatus.value = ''
  downloadError.value = ''
}

function handleProgress(progress: OllamaPullProgress) {
  downloadStatus.value = progress.status
  
  if (progress.total && progress.completed) {
    downloadProgress.value = (progress.completed / progress.total) * 100
  }
  else if (progress.status === 'pulling manifest') {
    downloadProgress.value = 5
  }
  else if (progress.status === 'downloading') {
    downloadProgress.value = Math.max(downloadProgress.value, 10)
  }
  else if (progress.status === 'verifying sha256 digest') {
    downloadProgress.value = 95
  }
  else if (progress.status === 'success') {
    downloadProgress.value = 100
  }
}

async function downloadModel() {
  const modelName = modelToDownload.value
  
  try {
    resetDownloadState()
    isDownloading.value = true
    downloadStatus.value = 'Starting download...'
    
    // Get Ollama API instance
    const api = await ollamaApi.value
    if (!api) {
      throw new Error('Ollama API not available in this environment')
    }
    
    // Create abort controller for this download
    abortController.value = new AbortController()
    
    await api.pullModel(modelName, handleProgress, abortController.value.signal)
    
    // Success
    downloadStatus.value = 'Download completed successfully!'
    emit('modelDownloaded', modelName)
    
    // Reset form
    selectedModel.value = ''
    customModelName.value = ''
    showCustomInput.value = false
    
  }
  catch (error) {
    if (error instanceof Error && error.message.includes('cancelled')) {
      downloadStatus.value = 'Download cancelled'
    } else {
      downloadError.value = error instanceof Error ? error.message : 'Unknown error occurred'
      downloadStatus.value = 'Download failed'
    }
  }
  finally {
    isDownloading.value = false
    abortController.value = null
  }
}

function cancelDownload() {
  if (abortController.value) {
    abortController.value.abort()
  }
  isDownloading.value = false
  resetDownloadState()
  downloadStatus.value = 'Download cancelled'
}

function toggleCustomInput() {
  showCustomInput.value = !showCustomInput.value
  if (!showCustomInput.value) {
    customModelName.value = ''
  }
  else {
    selectedModel.value = ''
  }
}

// Watch for base URL changes to reset state
watch(() => props.baseUrl, () => {
  resetDownloadState()
  isDownloading.value = false
})
</script>

<template>
  <div class="ollama-model-downloader" space-y-4>
    <!-- Header -->
    <div>
      <h3 class="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
        {{ t('settings.pages.providers.ollama.modelDownloader.title', 'Download Models') }}
      </h3>
      <p class="text-sm text-neutral-600 dark:text-neutral-400">
        {{ t('settings.pages.providers.ollama.modelDownloader.description', 'Download popular models directly from Ollama registry') }}
      </p>
    </div>

    <!-- Error Alert -->
    <Alert v-if="downloadError" type="error">
      <template #title>
        {{ t('settings.pages.providers.ollama.modelDownloader.error', 'Download Error') }}
      </template>
      <template #content>
        <div class="whitespace-pre-wrap break-all">
          {{ downloadError }}
        </div>
      </template>
    </Alert>

    <!-- Model Selection -->
    <div v-if="!showCustomInput" space-y-3>
      <label class="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
        {{ t('settings.pages.providers.ollama.modelDownloader.selectModel', 'Select a model to download') }}
      </label>
      
      <div class="grid gap-2 max-h-64 overflow-y-auto">
        <label
          v-for="model in POPULAR_OLLAMA_MODELS"
          :key="model.name"
          class="flex items-center space-x-3 p-3 border border-neutral-200 dark:border-neutral-700 rounded-lg cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
          :class="{
            'bg-primary-50 dark:bg-primary-900/20 border-primary-300 dark:border-primary-600': selectedModel === model.name
          }"
        >
          <input
            v-model="selectedModel"
            type="radio"
            :value="model.name"
            class="text-primary-600 focus:ring-primary-500"
          >
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between">
              <h4 class="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                {{ model.displayName }}
              </h4>
              <span class="text-xs text-neutral-500 dark:text-neutral-400">
                {{ model.size }}
              </span>
            </div>
            <p class="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
              {{ model.description }}
            </p>
            <div class="flex gap-1 mt-2">
              <span
                v-for="tag in model.tags"
                :key="tag"
                class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                :class="{
                  'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300': tag === 'recommended',
                  'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300': tag === 'popular',
                  'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300': tag === 'fast',
                  'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300': tag === 'powerful',
                  'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300': !['recommended', 'popular', 'fast', 'powerful'].includes(tag)
                }"
              >
                {{ tag }}
              </span>
            </div>
          </div>
        </label>
      </div>
    </div>

    <!-- Custom Model Input -->
    <div v-if="showCustomInput" space-y-3>
      <label class="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
        {{ t('settings.pages.providers.ollama.modelDownloader.customModel', 'Custom model name') }}
      </label>
      
      <input
        v-model="customModelName"
        type="text"
        placeholder="e.g., llama3.2:3b, mistral:latest"
        class="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        :class="{
          'border-red-300 dark:border-red-600': customModelName && !isValidCustomModel
        }"
      >
      
      <p v-if="customModelName && !isValidCustomModel" class="text-xs text-red-600 dark:text-red-400">
        {{ t('settings.pages.providers.ollama.modelDownloader.invalidModelName', 'Invalid model name format') }}
      </p>
      
      <p class="text-xs text-neutral-600 dark:text-neutral-400">
        {{ t('settings.pages.providers.ollama.modelDownloader.customModelHelp', 'Enter a model name from Ollama registry (e.g., llama3.2:3b, mistral:latest)') }}
      </p>
    </div>

    <!-- Toggle Custom Input -->
    <div class="flex justify-center">
      <button
        type="button"
        @click="toggleCustomInput"
        class="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 underline"
      >
        {{ showCustomInput 
          ? t('settings.pages.providers.ollama.modelDownloader.showPopular', 'Show popular models')
          : t('settings.pages.providers.ollama.modelDownloader.enterCustom', 'Enter custom model name')
        }}
      </button>
    </div>

    <!-- Download Progress -->
    <div v-if="isDownloading || downloadStatus" space-y-3>
      <div class="flex items-center justify-between">
        <span class="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          {{ downloadStatus || 'Preparing download...' }}
        </span>
        <span v-if="downloadProgress > 0" class="text-sm text-neutral-600 dark:text-neutral-400">
          {{ downloadProgress.toFixed(1) }}%
        </span>
      </div>
      
      <Progress
        :progress="downloadProgress"
        bar-class="bg-primary-500 dark:bg-primary-400"
      />
    </div>

    <!-- Action Buttons -->
    <div class="flex gap-3">
      <Button
        v-if="!isDownloading"
        :disabled="!canDownload"
        variant="primary"
        @click="downloadModel"
      >
        <template v-if="selectedModel || (showCustomInput && isValidCustomModel)">
          {{ t('settings.pages.providers.ollama.modelDownloader.download', 'Download Model') }}
        </template>
        <template v-else>
          {{ t('settings.pages.providers.ollama.modelDownloader.selectFirst', 'Select a model first') }}
        </template>
      </Button>
      
      <Button
        v-if="isDownloading"
        variant="danger"
        @click="cancelDownload"
      >
        {{ t('settings.pages.providers.ollama.modelDownloader.cancel', 'Cancel') }}
      </Button>
    </div>

    <!-- Help Text -->
    <div class="text-xs text-neutral-600 dark:text-neutral-400 space-y-1">
      <p>
        {{ t('settings.pages.providers.ollama.modelDownloader.helpText1', 'Models will be downloaded to your local Ollama installation.') }}
      </p>
      <p>
        {{ t('settings.pages.providers.ollama.modelDownloader.helpText2', 'Make sure you have enough disk space before downloading large models.') }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.ollama-model-downloader {
  @apply p-4 border border-neutral-200 dark:border-neutral-700 rounded-lg bg-neutral-50 dark:bg-neutral-800/50;
}
</style>