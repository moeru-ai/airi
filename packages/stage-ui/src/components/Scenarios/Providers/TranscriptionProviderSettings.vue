<script setup lang="ts">
import type { WhisperConfig } from '../../../stores/modules/transcription'

import { useDebounceFn } from '@vueuse/core'
import { computed, ref, watch } from 'vue'

interface Model {
  id: string
  name: string
  description: string
}

interface Language {
  id: string
  name: string
  code: string
}

interface Props {
  title: string
  description: string
  config: WhisperConfig
  availableModels: Model[]
  availableLanguages: Language[]
}

interface Emits {
  (e: 'update:config', config: Partial<WhisperConfig>): void
  (e: 'testConnection'): Promise<boolean>
  (e: 'startRecording'): Promise<void>
  (e: 'stopRecording'): void
  (e: 'transcribeFile', file: File): Promise<string>
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// Local config for editing
const localConfig = ref<WhisperConfig>({ ...props.config })

// Test state
const isRecording = ref(false)
const isTranscribing = ref(false)
const transcriptionResult = ref<string | null>(null)
const testError = ref<string | null>(null)

// Connection state
const isTestingConnection = ref(false)
const connectionStatus = ref<'connected' | 'disconnected' | 'unknown'>('unknown')
const connectionError = ref<string | null>(null)

// File input ref
const fileInput = ref<HTMLInputElement>()

// Computed
const connectionStatusText = computed(() => {
  switch (connectionStatus.value) {
    case 'connected':
      return 'Подключено'
    case 'disconnected':
      return 'Отключено'
    default:
      return 'Неизвестно'
  }
})

// Watch for prop changes
watch(() => props.config, (newConfig) => {
  localConfig.value = { ...newConfig }
}, { deep: true })

// Debounced config update
const debouncedConfigUpdate = useDebounceFn((config: Partial<WhisperConfig>) => {
  emit('update:config', config)
}, 500)

// Methods
function onConfigChange() {
  debouncedConfigUpdate(localConfig.value)
}

async function testConnection() {
  isTestingConnection.value = true
  connectionError.value = null

  try {
    const isConnected = await emit('testConnection')
    connectionStatus.value = isConnected ? 'connected' : 'disconnected'
    if (!isConnected) {
      connectionError.value = 'Не удается подключиться к серверу'
    }
  }
  catch (error) {
    connectionStatus.value = 'disconnected'
    connectionError.value = error instanceof Error ? error.message : 'Ошибка подключения'
  }
  finally {
    isTestingConnection.value = false
  }
}

async function startRecording() {
  isRecording.value = true
  transcriptionResult.value = null
  testError.value = null

  try {
    await emit('startRecording')
  }
  catch (error) {
    isRecording.value = false
    testError.value = error instanceof Error ? error.message : 'Ошибка записи'
  }
}

function stopRecording() {
  isRecording.value = false
  isTranscribing.value = true
  emit('stopRecording')

  // Reset transcribing state after some time (will be handled by store)
  setTimeout(() => {
    isTranscribing.value = false
  }, 5000)
}

function uploadFile() {
  fileInput.value?.click()
}

async function handleFileUpload(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]

  if (!file)
    return

  isTranscribing.value = true
  transcriptionResult.value = null
  testError.value = null

  try {
    const result = await emit('transcribeFile', file)
    transcriptionResult.value = result
  }
  catch (error) {
    testError.value = error instanceof Error ? error.message : 'Ошибка транскрипции'
  }
  finally {
    isTranscribing.value = false
    // Reset file input
    target.value = ''
  }
}

// Initialize connection test
if (localConfig.value.provider === 'koboldcpp') {
  testConnection()
}
else {
  connectionStatus.value = 'connected' // Tauri is always "connected"
}
</script>

<template>
  <div class="transcription-provider-settings">
    <!-- Header -->
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h3 class="text-lg text-gray-900 font-semibold dark:text-white">
          {{ title }}
        </h3>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          {{ description }}
        </p>
      </div>
      <div class="flex items-center space-x-2">
        <div
          class="h-2 w-2 rounded-full"
          :class="connectionStatus === 'connected' ? 'bg-green-500' : connectionStatus === 'disconnected' ? 'bg-red-500' : 'bg-yellow-500'"
        />
        <span class="text-xs text-gray-500 dark:text-gray-400">
          {{ connectionStatusText }}
        </span>
      </div>
    </div>

    <!-- Configuration Section -->
    <div class="space-y-6">
      <!-- Provider Selection -->
      <div>
        <label class="mb-2 block text-sm text-gray-700 font-medium dark:text-gray-300">
          {{ $t('transcription.settings.provider') }}
        </label>
        <select
          v-model="localConfig.provider"
          class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm shadow-sm dark:border-gray-600 focus:border-blue-500 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          @change="onConfigChange"
        >
          <option value="tauri">
            Tauri Whisper (локальный)
          </option>
          <option value="koboldcpp">
            KoboldCPP Whisper (внешний сервер)
          </option>
        </select>
      </div>

      <!-- KoboldCPP Base URL (only if provider is koboldcpp) -->
      <div v-if="localConfig.provider === 'koboldcpp'">
        <label class="mb-2 block text-sm text-gray-700 font-medium dark:text-gray-300">
          {{ $t('transcription.settings.baseUrl') }}
        </label>
        <div class="flex space-x-2">
          <input
            v-model="localConfig.koboldcppBaseUrl"
            type="url"
            class="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm shadow-sm dark:border-gray-600 focus:border-blue-500 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400"
            placeholder="http://127.0.0.1:5001"
            @input="onConfigChange"
          >
          <button
            type="button"
            :disabled="isTestingConnection"
            class="rounded-md bg-blue-600 px-4 py-2 text-sm text-white font-medium disabled:cursor-not-allowed hover:bg-blue-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            @click="testConnection"
          >
            <div v-if="isTestingConnection" class="flex items-center">
              <div class="mr-2 h-4 w-4 animate-spin border-2 border-white border-t-transparent rounded-full" />
              {{ $t('transcription.settings.testing') }}
            </div>
            <span v-else>{{ $t('transcription.settings.test') }}</span>
          </button>
        </div>
        <p v-if="connectionError" class="mt-1 text-sm text-red-600 dark:text-red-400">
          {{ connectionError }}
        </p>
      </div>

      <!-- Model Selection (for Tauri) -->
      <div v-if="localConfig.provider === 'tauri'">
        <label class="mb-2 block text-sm text-gray-700 font-medium dark:text-gray-300">
          {{ $t('transcription.settings.model') }}
        </label>
        <select
          v-model="localConfig.tauriModel"
          class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm shadow-sm dark:border-gray-600 focus:border-blue-500 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          @change="onConfigChange"
        >
          <option v-for="model in availableModels" :key="model.id" :value="model.id">
            {{ model.name }} - {{ model.description }}
          </option>
        </select>
      </div>

      <!-- Language Selection -->
      <div>
        <label class="mb-2 block text-sm text-gray-700 font-medium dark:text-gray-300">
          {{ $t('transcription.settings.language') }}
        </label>
        <select
          v-model="localConfig.language"
          class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm shadow-sm dark:border-gray-600 focus:border-blue-500 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          @change="onConfigChange"
        >
          <option v-for="language in availableLanguages" :key="language.id" :value="language.id">
            {{ language.name }}
          </option>
        </select>
      </div>

      <!-- Advanced Settings -->
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="mb-2 block text-sm text-gray-700 font-medium dark:text-gray-300">
            {{ $t('transcription.settings.temperature') }}
          </label>
          <input
            v-model.number="localConfig.temperature"
            type="number"
            min="0"
            max="1"
            step="0.1"
            class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm shadow-sm dark:border-gray-600 focus:border-blue-500 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            @input="onConfigChange"
          >
        </div>
        <div>
          <label class="mb-2 block text-sm text-gray-700 font-medium dark:text-gray-300">
            {{ $t('transcription.settings.maxTokens') }}
          </label>
          <input
            v-model.number="localConfig.maxTokens"
            type="number"
            min="1"
            max="1000"
            class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm shadow-sm dark:border-gray-600 focus:border-blue-500 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            @input="onConfigChange"
          >
        </div>
      </div>

      <!-- Test Playground -->
      <div class="border-t pt-6">
        <label class="mb-2 block text-sm text-gray-700 font-medium dark:text-gray-300">
          {{ $t('transcription.settings.testPlayground') }}
        </label>
        <div class="space-y-3">
          <!-- Recording Controls -->
          <div class="flex space-x-2">
            <button
              v-if="!isRecording"
              type="button"
              :disabled="isTranscribing"
              class="flex-1 rounded-md bg-red-600 px-4 py-2 text-sm text-white font-medium disabled:cursor-not-allowed hover:bg-red-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-red-500"
              @click="startRecording"
            >
              <div class="flex items-center justify-center">
                <div class="mr-2 h-4 w-4 rounded-full bg-white" />
                {{ $t('transcription.settings.startRecording') }}
              </div>
            </button>
            <button
              v-else
              type="button"
              class="flex-1 rounded-md bg-gray-600 px-4 py-2 text-sm text-white font-medium hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
              @click="stopRecording"
            >
              <div class="flex items-center justify-center">
                <div class="mr-2 h-4 w-4 bg-white" style="animation: pulse 1s infinite" />
                {{ $t('transcription.settings.stopRecording') }}
              </div>
            </button>
            <button
              type="button"
              :disabled="isTranscribing"
              class="rounded-md bg-blue-600 px-4 py-2 text-sm text-white font-medium disabled:cursor-not-allowed hover:bg-blue-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              @click="uploadFile"
            >
              {{ $t('transcription.settings.uploadFile') }}
            </button>
          </div>

          <!-- Transcription Status -->
          <div v-if="isTranscribing" class="flex items-center rounded-md bg-blue-50 p-3 dark:bg-blue-900/20">
            <div class="mr-3 h-4 w-4 animate-spin border-2 border-blue-600 border-t-transparent rounded-full" />
            <span class="text-sm text-blue-700 dark:text-blue-300">
              {{ $t('transcription.settings.transcribing') }}
            </span>
          </div>

          <!-- Transcription Result -->
          <div v-if="transcriptionResult" class="rounded-md bg-green-50 p-3 dark:bg-green-900/20">
            <p class="mb-1 text-sm text-green-700 font-medium dark:text-green-300">
              {{ $t('transcription.settings.result') }}:
            </p>
            <p class="text-sm text-gray-900 dark:text-white">
              {{ transcriptionResult }}
            </p>
          </div>

          <!-- Error Display -->
          <div v-if="testError" class="rounded-md bg-red-50 p-3 dark:bg-red-900/20">
            <p class="text-sm text-red-700 dark:text-red-300">
              {{ testError }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Advanced Settings Slot -->
    <div v-if="$slots.advanced" class="mt-6 border-t pt-6">
      <slot name="advanced" />
    </div>

    <!-- Hidden file input -->
    <input
      ref="fileInput"
      type="file"
      accept="audio/*"
      style="display: none"
      @change="handleFileUpload"
    >
  </div>
</template>

<style scoped>
.transcription-provider-settings {
  @apply bg-white dark:bg-gray-900 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
</style>
