<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useTranscriptionStore } from '../../../stores/modules/transcription'

defineOptions({
  name: 'TranscriptionPlayground',
})

const { t } = useI18n()
const transcriptionStore = useTranscriptionStore()

// Reactive state
const selectedProvider = ref(transcriptionStore.whisperConfig.provider)
const selectedModel = ref(transcriptionStore.whisperConfig.tauriModel)
const selectedLanguage = ref(transcriptionStore.whisperConfig.language)
const isDragOver = ref(false)
const audioLevel = ref(0)
const recordingDuration = ref(0)
const transcriptionProgress = ref(0)
const fileInput = ref<HTMLInputElement>()

// Recording timer
let recordingTimer: NodeJS.Timeout | null = null

// Sample files for testing
const sampleFiles = ref([
  {
    id: 'greeting',
    name: t('transcription.playground.samples.greeting'),
    description: t('transcription.playground.samples.greetingDesc'),
    url: '/samples/greeting.wav',
  },
  {
    id: 'weather',
    name: t('transcription.playground.samples.weather'),
    description: t('transcription.playground.samples.weatherDesc'),
    url: '/samples/weather.wav',
  },
  {
    id: 'meeting',
    name: t('transcription.playground.samples.meeting'),
    description: t('transcription.playground.samples.meetingDesc'),
    url: '/samples/meeting.wav',
  },
  {
    id: 'poetry',
    name: t('transcription.playground.samples.poetry'),
    description: t('transcription.playground.samples.poetryDesc'),
    url: '/samples/poetry.wav',
  },
])

// Methods
function onProviderChange() {
  transcriptionStore.updateConfig({ provider: selectedProvider.value })
}

async function startRecording() {
  try {
    await transcriptionStore.startRecording()

    // Start recording timer
    recordingDuration.value = 0
    recordingTimer = setInterval(() => {
      recordingDuration.value++
    }, 1000)

    // Simulate audio level (in real implementation, you'd get this from the audio stream)
    simulateAudioLevel()
  }
  catch (error) {
    console.error('Failed to start recording:', error)
  }
}

function stopRecording() {
  transcriptionStore.stopRecording()

  if (recordingTimer) {
    clearInterval(recordingTimer)
    recordingTimer = null
  }

  audioLevel.value = 0
}

function simulateAudioLevel() {
  if (!transcriptionStore.state.isRecording)
    return

  // Simulate realistic audio level fluctuation
  audioLevel.value = Math.random() * 80 + 10

  setTimeout(() => {
    if (transcriptionStore.state.isRecording) {
      simulateAudioLevel()
    }
  }, 100)
}

function selectFile() {
  fileInput.value?.click()
}

async function onFileSelect(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]

  if (file) {
    await transcribeFile(file)
    // Reset file input
    target.value = ''
  }
}

function onDrop(event: DragEvent) {
  isDragOver.value = false
  const files = event.dataTransfer?.files

  if (files?.length) {
    transcribeFile(files[0])
  }
}

async function transcribeFile(file: File) {
  try {
    // Simulate progress
    transcriptionProgress.value = 0
    const progressInterval = setInterval(() => {
      transcriptionProgress.value += 10
      if (transcriptionProgress.value >= 100) {
        clearInterval(progressInterval)
        transcriptionProgress.value = 0
      }
    }, 500)

    await transcriptionStore.transcribeFile(file)
  }
  catch (error) {
    console.error('Transcription failed:', error)
    transcriptionProgress.value = 0
  }
}

async function transcribeSample(sample: { url: string }) {
  try {
    // Fetch sample file
    const response = await fetch(sample.url)
    const blob = await response.blob()
    const file = new File([blob], 'sample.wav', { type: 'audio/wav' })

    await transcribeFile(file)
  }
  catch (error) {
    console.error('Failed to transcribe sample:', error)
  }
}

function copyResult() {
  if (transcriptionStore.state.lastResult?.text) {
    navigator.clipboard.writeText(transcriptionStore.state.lastResult.text)
  }
}

function exportResult() {
  if (!transcriptionStore.state.lastResult)
    return

  const result = transcriptionStore.state.lastResult
  const exportData = {
    text: result.text,
    language: result.language,
    confidence: result.confidence,
    segments: result.segments,
    timestamp: new Date().toISOString(),
    provider: selectedProvider.value,
  }

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = `transcription_${Date.now()}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  URL.revokeObjectURL(url)
}

function formatRecordingTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const remainingSecs = Math.floor(seconds % 60)
  return `${mins}:${remainingSecs.toString().padStart(2, '0')}`
}

// Cleanup
onUnmounted(() => {
  if (recordingTimer) {
    clearInterval(recordingTimer)
  }
})
</script>

<template>
  <div class="transcription-playground">
    <!-- Header -->
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h3 class="text-lg text-gray-900 font-semibold dark:text-white">
          {{ t('transcription.playground.title') }}
        </h3>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          {{ t('transcription.playground.description') }}
        </p>
      </div>
      <div class="flex items-center space-x-2">
        <div
          class="h-2 w-2 rounded-full"
          :class="transcriptionStore.isReady ? 'bg-green-500' : 'bg-red-500'"
        />
        <span class="text-xs text-gray-500 dark:text-gray-400">
          {{ transcriptionStore.isReady ? t('common.ready') : t('common.notReady') }}
        </span>
      </div>
    </div>

    <!-- Provider Settings -->
    <div class="grid grid-cols-1 mb-6 gap-4 md:grid-cols-3">
      <div>
        <label class="mb-2 block text-sm text-gray-700 font-medium dark:text-gray-300">
          {{ t('transcription.playground.provider') }}
        </label>
        <select
          v-model="selectedProvider"
          class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm shadow-sm dark:border-gray-600 focus:border-blue-500 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          @change="onProviderChange"
        >
          <option value="tauri">
            Tauri Whisper
          </option>
          <option value="koboldcpp">
            KoboldCPP Whisper
          </option>
        </select>
      </div>

      <div v-if="selectedProvider === 'tauri'">
        <label class="mb-2 block text-sm text-gray-700 font-medium dark:text-gray-300">
          {{ t('transcription.playground.model') }}
        </label>
        <select
          v-model="selectedModel"
          class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm shadow-sm dark:border-gray-600 focus:border-blue-500 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option v-for="model in transcriptionStore.availableModels" :key="model.id" :value="model.id">
            {{ model.name }}
          </option>
        </select>
      </div>

      <div>
        <label class="mb-2 block text-sm text-gray-700 font-medium dark:text-gray-300">
          {{ t('transcription.playground.language') }}
        </label>
        <select
          v-model="selectedLanguage"
          class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm shadow-sm dark:border-gray-600 focus:border-blue-500 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option v-for="language in transcriptionStore.availableLanguages" :key="language.id" :value="language.id">
            {{ language.name }}
          </option>
        </select>
      </div>
    </div>

    <!-- Recording Section -->
    <div class="space-y-6">
      <!-- Live Recording -->
      <div class="border border-gray-200 rounded-lg p-4 dark:border-gray-700">
        <h4 class="text-md mb-3 text-gray-900 font-medium dark:text-white">
          {{ t('transcription.playground.liveRecording') }}
        </h4>

        <div class="flex items-center space-x-4">
          <!-- Recording Button -->
          <button
            v-if="!transcriptionStore.state.isRecording"
            type="button"
            :disabled="transcriptionStore.state.isTranscribing || !transcriptionStore.isReady"
            class="flex items-center rounded-md bg-red-600 px-4 py-2 text-sm text-white font-medium disabled:cursor-not-allowed hover:bg-red-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-red-500"
            @click="startRecording"
          >
            <div class="mr-2 h-4 w-4 rounded-full bg-white" />
            {{ t('transcription.playground.startRecording') }}
          </button>

          <button
            v-else
            type="button"
            class="flex items-center rounded-md bg-gray-600 px-4 py-2 text-sm text-white font-medium hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
            @click="stopRecording"
          >
            <div class="mr-2 h-4 w-4 animate-pulse bg-white" />
            {{ t('transcription.playground.stopRecording') }}
          </button>

          <!-- Audio Level Indicator -->
          <div v-if="transcriptionStore.state.isRecording" class="max-w-xs flex-1">
            <div class="h-2 rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                class="h-2 rounded-full bg-red-500 transition-all duration-150"
                :style="{ width: `${audioLevel}%` }"
              />
            </div>
            <span class="mt-1 text-xs text-gray-500">{{ t('transcription.playground.audioLevel') }}</span>
          </div>

          <!-- Recording Duration -->
          <div v-if="transcriptionStore.state.isRecording" class="text-sm text-gray-600 dark:text-gray-400">
            {{ formatRecordingTime(recordingDuration) }}
          </div>
        </div>
      </div>

      <!-- File Upload -->
      <div class="border border-gray-200 rounded-lg p-4 dark:border-gray-700">
        <h4 class="text-md mb-3 text-gray-900 font-medium dark:text-white">
          {{ t('transcription.playground.fileUpload') }}
        </h4>

        <div class="space-y-3">
          <!-- Drag & Drop Area -->
          <div
            class="border-2 border-gray-300 rounded-lg border-dashed p-6 text-center transition-colors dark:border-gray-600"
            :class="{ 'border-blue-500 bg-blue-50 dark:bg-blue-900/20': isDragOver }"
            @dragover.prevent="isDragOver = true"
            @dragleave.prevent="isDragOver = false"
            @drop.prevent="onDrop"
          >
            <div class="space-y-2">
              <div class="text-3xl text-gray-400">
                <div class="i-solar:cloud-upload-bold-duotone mx-auto h-12 w-12" />
              </div>
              <p class="text-sm text-gray-600 dark:text-gray-400">
                {{ t('transcription.playground.dragDropText') }}
              </p>
              <button
                type="button"
                class="rounded-md bg-blue-600 px-4 py-2 text-sm text-white font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                @click="selectFile"
              >
                {{ t('transcription.playground.selectFile') }}
              </button>
            </div>
          </div>

          <!-- Supported Formats -->
          <p class="text-center text-xs text-gray-500 dark:text-gray-400">
            {{ t('transcription.playground.supportedFormats') }}: WAV, MP3, OGG, M4A, FLAC
          </p>
        </div>
      </div>

      <!-- Sample Audio Files -->
      <div class="border border-gray-200 rounded-lg p-4 dark:border-gray-700">
        <h4 class="text-md mb-3 text-gray-900 font-medium dark:text-white">
          {{ t('transcription.playground.sampleFiles') }}
        </h4>

        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <button
            v-for="sample in sampleFiles"
            :key="sample.id"
            type="button"
            :disabled="transcriptionStore.state.isTranscribing"
            class="border border-gray-200 rounded-md p-3 text-left dark:border-gray-600 hover:bg-gray-50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:hover:bg-gray-800"
            @click="transcribeSample(sample)"
          >
            <div class="text-sm text-gray-900 font-medium dark:text-white">
              {{ sample.name }}
            </div>
            <div class="text-xs text-gray-500 dark:text-gray-400">
              {{ sample.description }}
            </div>
          </button>
        </div>
      </div>

      <!-- Transcription Status -->
      <div v-if="transcriptionStore.state.isTranscribing" class="rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
        <div class="flex items-center">
          <div class="mr-3 h-5 w-5 animate-spin border-2 border-blue-600 border-t-transparent rounded-full" />
          <div>
            <div class="text-blue-700 font-medium dark:text-blue-300">
              {{ t('transcription.playground.transcribing') }}
            </div>
            <div class="text-sm text-blue-600 dark:text-blue-400">
              {{ t('transcription.playground.pleaseWait') }}
            </div>
          </div>
        </div>

        <!-- Progress Bar (if available) -->
        <div v-if="transcriptionProgress > 0" class="mt-3">
          <div class="h-2 rounded-full bg-blue-200 dark:bg-blue-800">
            <div
              class="h-2 rounded-full bg-blue-600 transition-all duration-300"
              :style="{ width: `${transcriptionProgress}%` }"
            />
          </div>
          <div class="mt-1 text-xs text-blue-600 dark:text-blue-400">
            {{ transcriptionProgress }}%
          </div>
        </div>
      </div>

      <!-- Transcription Result -->
      <div v-if="transcriptionStore.state.lastResult" class="space-y-4">
        <div class="rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
          <h4 class="mb-2 text-green-700 font-medium dark:text-green-300">
            {{ t('transcription.playground.result') }}
          </h4>

          <div class="space-y-3">
            <!-- Main Transcription Text -->
            <div class="border rounded bg-white p-3 dark:bg-gray-800">
              <p class="whitespace-pre-wrap text-gray-900 dark:text-white">
                {{ transcriptionStore.state.lastResult.text }}
              </p>
            </div>

            <!-- Metadata -->
            <div class="grid grid-cols-2 gap-2 text-xs text-green-600 md:grid-cols-4 dark:text-green-400">
              <span v-if="transcriptionStore.state.lastResult.language">
                {{ t('transcription.playground.detectedLanguage') }}: {{ transcriptionStore.state.lastResult.language }}
              </span>
              <span v-if="transcriptionStore.state.lastResult.confidence">
                {{ t('transcription.playground.confidence') }}: {{ Math.round(transcriptionStore.state.lastResult.confidence * 100) }}%
              </span>
              <span>
                {{ t('transcription.playground.charactersCount') }}: {{ transcriptionStore.state.lastResult.text.length }}
              </span>
              <span>
                {{ t('transcription.playground.wordsCount') }}: {{ transcriptionStore.state.lastResult.text.split(/\s+/).length }}
              </span>
            </div>

            <!-- Action Buttons -->
            <div class="flex space-x-2">
              <button
                type="button"
                class="rounded bg-blue-600 px-3 py-1 text-xs text-white font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                @click="copyResult"
              >
                {{ t('common.copy') }}
              </button>
              <button
                type="button"
                class="rounded bg-green-600 px-3 py-1 text-xs text-white font-medium hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
                @click="exportResult"
              >
                {{ t('common.export') }}
              </button>
            </div>
          </div>

          <!-- Segments (if available) -->
          <div v-if="transcriptionStore.state.lastResult.segments?.length" class="mt-4">
            <h5 class="mb-2 text-green-700 font-medium dark:text-green-300">
              {{ t('transcription.playground.segments') }}
            </h5>
            <div class="space-y-1">
              <div
                v-for="(segment, index) in transcriptionStore.state.lastResult.segments"
                :key="index"
                class="flex items-center text-xs space-x-2"
              >
                <span class="w-16 text-gray-500 font-mono dark:text-gray-400">
                  {{ formatTime(segment.start) }}
                </span>
                <span class="text-gray-500 dark:text-gray-400">-</span>
                <span class="w-16 text-gray-500 font-mono dark:text-gray-400">
                  {{ formatTime(segment.end) }}
                </span>
                <span class="flex-1 text-gray-900 dark:text-white">
                  {{ segment.text }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Error Display -->
      <div v-if="transcriptionStore.state.error" class="rounded-lg bg-red-50 p-4 dark:bg-red-900/20">
        <div class="flex items-center">
          <div class="mr-3 text-red-500">
            <div class="i-solar:danger-triangle-bold h-5 w-5" />
          </div>
          <div>
            <div class="text-red-700 font-medium dark:text-red-300">
              {{ t('transcription.playground.error') }}
            </div>
            <div class="text-sm text-red-600 dark:text-red-400">
              {{ transcriptionStore.state.error }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Hidden file input -->
    <input
      ref="fileInput"
      type="file"
      accept="audio/*"
      style="display: none"
      @change="onFileSelect"
    >
  </div>
</template>

<style scoped>
.transcription-playground {
  @apply bg-white dark:bg-gray-900 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700;
}

/* Drag and drop styles */
.drag-over {
  @apply border-blue-500 bg-blue-50 dark:bg-blue-900/20;
}
</style>
