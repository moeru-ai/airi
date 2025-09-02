<script setup lang="ts">
import type { WhisperConfig } from '@proj-airi/stage-ui/stores/modules/transcription'

import TranscriptionProviderSettings from '@proj-airi/stage-ui/components/Scenarios/Providers/TranscriptionProviderSettings.vue'

import { useTranscriptionStore } from '@proj-airi/stage-ui/stores/modules/transcription'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

defineOptions({
  name: 'TauriWhisperSettings',
})

const { t } = useI18n()
const transcriptionStore = useTranscriptionStore()

// Advanced settings
const advancedSettings = ref({
  threads: 4,
  processors: 'auto',
  enableDenoise: true,
  enableVAD: true,
  enableTimestamps: false,
})

// Model management
const downloadedModels = ref<Set<string>>(new Set(['base'])) // Assume base is pre-installed
const isDownloadingModel = ref<string | null>(null)
const downloadProgress = ref(0)

// System info
const systemInfo = ref({
  tauriAvailable: false,
  availableMemory: '0 GB',
  availableStorage: '0 GB',
})

// Performance metrics
const performanceMetrics = ref({
  averageTime: 2.5,
  accuracy: 95,
  totalTranscriptions: 0,
})

// Computed
const downloadedModelsCount = computed(() => downloadedModels.value.size)

// Methods
function updateConfig(config: Partial<WhisperConfig>) {
  transcriptionStore.updateConfig(config)
}

async function testConnection(): Promise<boolean> {
  const isConnected = await transcriptionStore.testConnection()
  systemInfo.value.tauriAvailable = isConnected
  return isConnected
}

async function startRecording(): Promise<void> {
  await transcriptionStore.startRecording()
}

function stopRecording(): void {
  transcriptionStore.stopRecording()
}

async function transcribeFile(file: File): Promise<string> {
  const result = await transcriptionStore.transcribeFile(file)
  performanceMetrics.value.totalTranscriptions++
  return result.text
}

function updateAdvancedSettings() {
  // Save advanced settings
  console.warn('Advanced settings updated:', advancedSettings.value)
}

function isModelDownloaded(modelId: string): boolean {
  return downloadedModels.value.has(modelId)
}

function getModelStatus(modelId: string): string {
  if (isDownloadingModel.value === modelId) {
    return t('common.downloading')
  }
  return isModelDownloaded(modelId) ? t('common.downloaded') : t('common.notDownloaded')
}

function getModelStatusClass(modelId: string): string {
  if (isDownloadingModel.value === modelId) {
    return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
  }
  return isModelDownloaded(modelId)
    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
    : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
}

async function downloadModel(modelId: string): Promise<void> {
  isDownloadingModel.value = modelId
  downloadProgress.value = 0

  try {
    // Simulate download progress
    const interval = setInterval(() => {
      downloadProgress.value += 10
      if (downloadProgress.value >= 100) {
        clearInterval(interval)
        downloadedModels.value.add(modelId)
        isDownloadingModel.value = null
        downloadProgress.value = 0
      }
    }, 1000)

    // Here you would call the actual Tauri command
    // await window.__TAURI__.tauri.invoke('download_whisper_model', { modelId })
  }
  catch (error) {
    console.error(`Failed to download model ${modelId}:`, error)
    isDownloadingModel.value = null
    downloadProgress.value = 0
  }
}

async function deleteModel(modelId: string): Promise<void> {
  try {
    // Here you would call the actual Tauri command
    // await window.__TAURI__.tauri.invoke('delete_whisper_model', { modelId })

    downloadedModels.value.delete(modelId)
  }
  catch (error) {
    console.error(`Failed to delete model ${modelId}:`, error)
  }
}

async function getSystemInfo() {
  try {
    // Here you would call actual Tauri commands to get system info
    if (window.__TAURI__) {
      systemInfo.value.tauriAvailable = true
      // systemInfo.value.availableMemory = await window.__TAURI__.tauri.invoke('get_available_memory')
      // systemInfo.value.availableStorage = await window.__TAURI__.tauri.invoke('get_available_storage')

      // Mock data for now
      systemInfo.value.availableMemory = '8.2 GB'
      systemInfo.value.availableStorage = '45.6 GB'
    }
  }
  catch (error) {
    console.error('Failed to get system info:', error)
  }
}

// Initialize
onMounted(async () => {
  await testConnection()
  await getSystemInfo()
})
</script>

<template>
  <div class="tauri-whisper-settings">
    <TranscriptionProviderSettings
      :title="t('settings.pages.providers.provider.tauri-whisper.title')"
      :description="t('settings.pages.providers.provider.tauri-whisper.description')"
      :config="transcriptionStore.whisperConfig"
      :available-models="transcriptionStore.availableModels"
      :available-languages="transcriptionStore.availableLanguages"
      @update:config="updateConfig"
      @test-connection="testConnection"
      @start-recording="startRecording"
      @stop-recording="stopRecording"
      @transcribe-file="transcribeFile"
    >
      <template #advanced>
        <!-- Advanced Tauri Whisper specific settings -->
        <div class="space-y-4">
          <h4 class="text-md text-gray-900 font-medium dark:text-white">
            {{ t('settings.pages.providers.provider.tauri-whisper.advanced.title') }}
          </h4>

          <!-- Model Download Management -->
          <div>
            <label class="mb-2 block text-sm text-gray-700 font-medium dark:text-gray-300">
              {{ t('settings.pages.providers.provider.tauri-whisper.advanced.modelManagement') }}
            </label>
            <div class="space-y-2">
              <div v-for="model in transcriptionStore.availableModels" :key="model.id" class="flex items-center justify-between border border-gray-200 rounded-md p-3 dark:border-gray-700">
                <div>
                  <div class="text-gray-900 font-medium dark:text-white">
                    {{ model.name }}
                  </div>
                  <div class="text-sm text-gray-500 dark:text-gray-400">
                    {{ model.description }}
                  </div>
                </div>
                <div class="flex items-center space-x-2">
                  <span class="rounded-full px-2 py-1 text-xs" :class="getModelStatusClass(model.id)">
                    {{ getModelStatus(model.id) }}
                  </span>
                  <button
                    v-if="!isModelDownloaded(model.id)"
                    type="button"
                    :disabled="isDownloadingModel === model.id"
                    class="rounded bg-blue-600 px-3 py-1 text-xs text-white font-medium hover:bg-blue-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    @click="downloadModel(model.id)"
                  >
                    <div v-if="isDownloadingModel === model.id" class="flex items-center">
                      <div class="mr-1 h-3 w-3 animate-spin border border-white border-t-transparent rounded-full" />
                      {{ downloadProgress }}%
                    </div>
                    <span v-else>{{ t('common.download') }}</span>
                  </button>
                  <button
                    v-else
                    type="button"
                    class="rounded bg-red-600 px-3 py-1 text-xs text-white font-medium hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                    @click="deleteModel(model.id)"
                  >
                    {{ t('common.delete') }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Processing Options -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="mb-2 block text-sm text-gray-700 font-medium dark:text-gray-300">
                {{ t('settings.pages.providers.provider.tauri-whisper.advanced.threads') }}
              </label>
              <input
                v-model.number="advancedSettings.threads"
                type="number"
                min="1"
                max="16"
                class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm shadow-sm dark:border-gray-600 focus:border-blue-500 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                @input="updateAdvancedSettings"
              >
            </div>

            <div>
              <label class="mb-2 block text-sm text-gray-700 font-medium dark:text-gray-300">
                {{ t('settings.pages.providers.provider.tauri-whisper.advanced.processors') }}
              </label>
              <select
                v-model="advancedSettings.processors"
                class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm shadow-sm dark:border-gray-600 focus:border-blue-500 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                @change="updateAdvancedSettings"
              >
                <option value="1">
                  1 процессор
                </option>
                <option value="2">
                  2 процессора
                </option>
                <option value="4">
                  4 процессора
                </option>
                <option value="auto">
                  Автоматически
                </option>
              </select>
            </div>
          </div>

          <!-- Audio Preprocessing -->
          <div class="space-y-3">
            <div class="flex items-center">
              <input
                id="denoise"
                v-model="advancedSettings.enableDenoise"
                type="checkbox"
                class="h-4 w-4 border-gray-300 rounded text-blue-600 focus:ring-blue-500"
                @change="updateAdvancedSettings"
              >
              <label for="denoise" class="ml-2 block text-sm text-gray-900 dark:text-white">
                {{ t('settings.pages.providers.provider.tauri-whisper.advanced.denoise') }}
              </label>
            </div>

            <div class="flex items-center">
              <input
                id="vad"
                v-model="advancedSettings.enableVAD"
                type="checkbox"
                class="h-4 w-4 border-gray-300 rounded text-blue-600 focus:ring-blue-500"
                @change="updateAdvancedSettings"
              >
              <label for="vad" class="ml-2 block text-sm text-gray-900 dark:text-white">
                {{ t('settings.pages.providers.provider.tauri-whisper.advanced.vad') }}
              </label>
            </div>

            <div class="flex items-center">
              <input
                id="timestamps"
                v-model="advancedSettings.enableTimestamps"
                type="checkbox"
                class="h-4 w-4 border-gray-300 rounded text-blue-600 focus:ring-blue-500"
                @change="updateAdvancedSettings"
              >
              <label for="timestamps" class="ml-2 block text-sm text-gray-900 dark:text-white">
                {{ t('settings.pages.providers.provider.tauri-whisper.advanced.timestamps') }}
              </label>
            </div>
          </div>
        </div>
      </template>
    </TranscriptionProviderSettings>

    <!-- System Info -->
    <div class="mt-6 border border-gray-200 rounded-lg p-4 dark:border-gray-700">
      <h4 class="text-md mb-3 text-gray-900 font-medium dark:text-white">
        {{ t('settings.pages.providers.provider.tauri-whisper.system.title') }}
      </h4>

      <div class="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span class="text-gray-600 dark:text-gray-400">
            {{ t('settings.pages.providers.provider.tauri-whisper.system.tauri') }}:
          </span>
          <span class="ml-2 font-medium" :class="systemInfo.tauriAvailable ? 'text-green-600' : 'text-red-600'">
            {{ systemInfo.tauriAvailable ? t('common.available') : t('common.unavailable') }}
          </span>
        </div>

        <div>
          <span class="text-gray-600 dark:text-gray-400">
            {{ t('settings.pages.providers.provider.tauri-whisper.system.models') }}:
          </span>
          <span class="ml-2 text-gray-900 font-medium dark:text-white">
            {{ downloadedModelsCount }}/{{ transcriptionStore.availableModels.length }}
          </span>
        </div>

        <div>
          <span class="text-gray-600 dark:text-gray-400">
            {{ t('settings.pages.providers.provider.tauri-whisper.system.memory') }}:
          </span>
          <span class="ml-2 text-gray-900 font-medium dark:text-white">
            {{ systemInfo.availableMemory }}
          </span>
        </div>

        <div>
          <span class="text-gray-600 dark:text-gray-400">
            {{ t('settings.pages.providers.provider.tauri-whisper.system.storage') }}:
          </span>
          <span class="ml-2 text-gray-900 font-medium dark:text-white">
            {{ systemInfo.availableStorage }}
          </span>
        </div>
      </div>
    </div>

    <!-- Performance Metrics -->
    <div class="mt-6 rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
      <h4 class="text-md mb-3 text-gray-900 font-medium dark:text-white">
        {{ t('settings.pages.providers.provider.tauri-whisper.performance.title') }}
      </h4>

      <div class="grid grid-cols-3 gap-4 text-sm">
        <div class="text-center">
          <div class="text-2xl text-blue-600 font-bold">
            {{ performanceMetrics.averageTime }}s
          </div>
          <div class="text-gray-600 dark:text-gray-400">
            {{ t('settings.pages.providers.provider.tauri-whisper.performance.avgTime') }}
          </div>
        </div>

        <div class="text-center">
          <div class="text-2xl text-green-600 font-bold">
            {{ performanceMetrics.accuracy }}%
          </div>
          <div class="text-gray-600 dark:text-gray-400">
            {{ t('settings.pages.providers.provider.tauri-whisper.performance.accuracy') }}
          </div>
        </div>

        <div class="text-center">
          <div class="text-2xl text-purple-600 font-bold">
            {{ performanceMetrics.totalTranscriptions }}
          </div>
          <div class="text-gray-600 dark:text-gray-400">
            {{ t('settings.pages.providers.provider.tauri-whisper.performance.total') }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  title: Tauri Whisper
  description: Настройки локального распознавания речи Tauri Whisper
  icon: i-solar:soundwave-bold-duotone
  section: providers
  subsection: transcription
</route>

<style scoped>
.tauri-whisper-settings {
  @apply space-y-6;
}
</style>
