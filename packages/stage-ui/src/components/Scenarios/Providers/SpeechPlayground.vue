<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useSpeechStore } from '../../../stores/modules/speech'

defineOptions({
  name: 'SpeechPlayground',
})

const { t } = useI18n()
const speechStore = useSpeechStore()

// Reactive state
const inputText = ref('Привет! Это тест синтеза речи с помощью AIRI.')
const selectedSpeaker = ref(speechStore.sileroConfig.speaker)
const sampleRate = ref(speechStore.sileroConfig.sampleRate)
const audioFormat = ref(speechStore.sileroConfig.format)
const generatedAudioUrl = ref<string | null>(null)
const showSuccess = ref(false)
const audioElement = ref<HTMLAudioElement>()

// Audio info
const audioInfo = ref<{
  duration: number
  size: number
  currentTime: number
} | null>(null)

// Text templates
const textTemplates = ref([
  { id: 'greeting', name: t('speech.playground.templates.greeting'), text: 'Привет! Как дела?' },
  { id: 'weather', name: t('speech.playground.templates.weather'), text: 'Сегодня прекрасная погода на улице.' },
  { id: 'meeting', name: t('speech.playground.templates.meeting'), text: 'Напоминаю о встрече в 15:00.' },
  { id: 'thanks', name: t('speech.playground.templates.thanks'), text: 'Спасибо за ваше время и внимание!' },
  { id: 'error', name: t('speech.playground.templates.error'), text: 'Произошла ошибка. Попробуйте еще раз.' },
  { id: 'success', name: t('speech.playground.templates.success'), text: 'Операция выполнена успешно!' },
])

// Computed
const wordCount = computed(() => {
  return inputText.value.trim().split(/\s+/).filter(word => word.length > 0).length
})

const estimatedDuration = computed(() => {
  // Rough estimate: ~150 words per minute for Russian speech
  const wordsPerSecond = 150 / 60
  return Math.ceil(wordCount.value / wordsPerSecond)
})

const currentSpeakerInfo = computed(() => {
  return speechStore.availableSpeakers.find(s => s.name === selectedSpeaker.value)
})

// Watch for speaker change
watch(selectedSpeaker, (newSpeaker) => {
  speechStore.updateConfig({ speaker: newSpeaker })
})

// Methods
async function generateSpeech() {
  if (!inputText.value.trim())
    return

  try {
    const audioUrl = await speechStore.generateSpeech({
      text: inputText.value,
      speaker: selectedSpeaker.value,
      sampleRate: sampleRate.value,
      format: audioFormat.value,
    })

    generatedAudioUrl.value = audioUrl
    showSuccess.value = true

    // Hide success message after 3 seconds
    setTimeout(() => {
      showSuccess.value = false
    }, 3000)
  }
  catch (error) {
    console.error('Speech generation failed:', error)
  }
}

async function playSpeech() {
  if (!generatedAudioUrl.value)
    return

  try {
    await speechStore.playSpeech(generatedAudioUrl.value)
  }
  catch (error) {
    console.error('Speech playback failed:', error)
  }
}

function stopSpeech() {
  speechStore.stopSpeech()
}

function downloadAudio() {
  if (!generatedAudioUrl.value)
    return

  const link = document.createElement('a')
  link.href = generatedAudioUrl.value
  link.download = `speech_${Date.now()}.${audioFormat.value}`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

function onAudioLoaded() {
  if (!audioElement.value)
    return

  audioInfo.value = {
    duration: audioElement.value.duration,
    size: 0, // Will be updated when we have blob size info
    currentTime: 0,
  }
}

function onTimeUpdate() {
  if (!audioElement.value || !audioInfo.value)
    return

  audioInfo.value.currentTime = audioElement.value.currentTime
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds))
    return '0:00'

  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function formatBytes(bytes: number): string {
  if (bytes === 0)
    return '0 B'

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
}

// Keyboard shortcuts
function onKeydown(event: KeyboardEvent) {
  if (event.ctrlKey && event.key === 'Enter') {
    event.preventDefault()
    generateSpeech()
  }

  if (event.key === 'Escape') {
    stopSpeech()
  }
}

// Add keyboard event listener
document.addEventListener('keydown', onKeydown)
</script>

<template>
  <div class="speech-playground">
    <!-- Header -->
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h3 class="text-lg text-gray-900 font-semibold dark:text-white">
          {{ t('speech.playground.title') }}
        </h3>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          {{ t('speech.playground.description') }}
        </p>
      </div>
      <div class="flex items-center space-x-2">
        <div
          class="h-2 w-2 rounded-full"
          :class="speechStore.isReady ? 'bg-green-500' : 'bg-red-500'"
        />
        <span class="text-xs text-gray-500 dark:text-gray-400">
          {{ speechStore.isReady ? t('common.ready') : t('common.notReady') }}
        </span>
      </div>
    </div>

    <!-- Text Input -->
    <div class="space-y-4">
      <div>
        <label class="mb-2 block text-sm text-gray-700 font-medium dark:text-gray-300">
          {{ t('speech.playground.inputText') }}
        </label>
        <textarea
          v-model="inputText"
          rows="4"
          class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm shadow-sm dark:border-gray-600 focus:border-blue-500 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400"
          :placeholder="t('speech.playground.inputPlaceholder')"
          @keydown.ctrl.enter="generateSpeech"
        />
      </div>

      <!-- Quick Text Templates -->
      <div>
        <label class="mb-2 block text-sm text-gray-700 font-medium dark:text-gray-300">
          {{ t('speech.playground.quickTemplates') }}
        </label>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="template in textTemplates"
            :key="template.id"
            type="button"
            class="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700 dark:bg-gray-700 hover:bg-gray-200 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 dark:hover:bg-gray-600"
            @click="inputText = template.text"
          >
            {{ template.name }}
          </button>
        </div>
      </div>

      <!-- Speaker and Settings -->
      <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <label class="mb-2 block text-sm text-gray-700 font-medium dark:text-gray-300">
            {{ t('speech.playground.speaker') }}
          </label>
          <select
            v-model="selectedSpeaker"
            class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm shadow-sm dark:border-gray-600 focus:border-blue-500 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option v-for="speaker in speechStore.availableSpeakers" :key="speaker.name" :value="speaker.name">
              {{ speaker.description || speaker.name }}
            </option>
          </select>
        </div>

        <div>
          <label class="mb-2 block text-sm text-gray-700 font-medium dark:text-gray-300">
            {{ t('speech.playground.sampleRate') }}
          </label>
          <select
            v-model.number="sampleRate"
            class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm shadow-sm dark:border-gray-600 focus:border-blue-500 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option :value="16000">
              16 kHz
            </option>
            <option :value="22050">
              22.05 kHz
            </option>
            <option :value="44100">
              44.1 kHz
            </option>
            <option :value="48000">
              48 kHz
            </option>
          </select>
        </div>

        <div>
          <label class="mb-2 block text-sm text-gray-700 font-medium dark:text-gray-300">
            {{ t('speech.playground.format') }}
          </label>
          <select
            v-model="audioFormat"
            class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm shadow-sm dark:border-gray-600 focus:border-blue-500 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="wav">
              WAV
            </option>
            <option value="mp3">
              MP3
            </option>
            <option value="ogg">
              OGG
            </option>
          </select>
        </div>
      </div>

      <!-- Control Buttons -->
      <div class="flex space-x-3">
        <button
          type="button"
          :disabled="!inputText.trim() || speechStore.state.isGenerating || !speechStore.isReady"
          class="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm text-white font-medium disabled:cursor-not-allowed hover:bg-blue-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          @click="generateSpeech"
        >
          <div v-if="speechStore.state.isGenerating" class="flex items-center justify-center">
            <div class="mr-2 h-4 w-4 animate-spin border-2 border-white border-t-transparent rounded-full" />
            {{ t('speech.playground.generating') }}
          </div>
          <span v-else>{{ t('speech.playground.generate') }}</span>
        </button>

        <button
          v-if="generatedAudioUrl"
          type="button"
          :disabled="speechStore.state.isPlaying"
          class="rounded-md bg-green-600 px-4 py-2 text-sm text-white font-medium disabled:cursor-not-allowed hover:bg-green-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-green-500"
          @click="playSpeech"
        >
          <div v-if="speechStore.state.isPlaying" class="flex items-center">
            <div class="mr-2 h-4 w-4 animate-pulse rounded-full bg-white" />
            {{ t('speech.playground.playing') }}
          </div>
          <span v-else>{{ t('speech.playground.play') }}</span>
        </button>

        <button
          v-if="speechStore.state.isPlaying"
          type="button"
          class="rounded-md bg-red-600 px-4 py-2 text-sm text-white font-medium hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
          @click="stopSpeech"
        >
          {{ t('speech.playground.stop') }}
        </button>

        <button
          v-if="generatedAudioUrl"
          type="button"
          class="rounded-md bg-gray-600 px-4 py-2 text-sm text-white font-medium hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
          @click="downloadAudio"
        >
          {{ t('speech.playground.download') }}
        </button>
      </div>

      <!-- Audio Visualization -->
      <div v-if="generatedAudioUrl" class="mt-4">
        <label class="mb-2 block text-sm text-gray-700 font-medium dark:text-gray-300">
          {{ t('speech.playground.audioPreview') }}
        </label>
        <div class="border border-gray-200 rounded-md bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
          <audio
            ref="audioElement"
            :src="generatedAudioUrl"
            controls
            class="w-full"
            @loadedmetadata="onAudioLoaded"
            @timeupdate="onTimeUpdate"
          />

          <!-- Audio Info -->
          <div v-if="audioInfo" class="grid grid-cols-3 mt-2 gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span>{{ t('speech.playground.duration') }}: {{ formatTime(audioInfo.duration) }}</span>
            <span>{{ t('speech.playground.size') }}: {{ formatBytes(audioInfo.size) }}</span>
            <span>{{ t('speech.playground.currentTime') }}: {{ formatTime(audioInfo.currentTime) }}</span>
          </div>
        </div>
      </div>

      <!-- Error Display -->
      <div v-if="speechStore.state.error" class="rounded-md bg-red-50 p-3 dark:bg-red-900/20">
        <p class="text-sm text-red-700 dark:text-red-300">
          {{ speechStore.state.error }}
        </p>
      </div>

      <!-- Success Message -->
      <div v-if="showSuccess" class="rounded-md bg-green-50 p-3 dark:bg-green-900/20">
        <p class="text-sm text-green-700 dark:text-green-300">
          {{ t('speech.playground.generationSuccess') }}
        </p>
      </div>

      <!-- Usage Statistics -->
      <div class="mt-6 rounded-md bg-blue-50 p-4 dark:bg-blue-900/20">
        <h4 class="mb-2 text-sm text-blue-700 font-medium dark:text-blue-300">
          {{ t('speech.playground.statistics') }}
        </h4>
        <div class="grid grid-cols-2 gap-2 text-xs text-blue-600 md:grid-cols-4 dark:text-blue-400">
          <span>{{ t('speech.playground.charactersCount') }}: {{ inputText.length }}</span>
          <span>{{ t('speech.playground.wordsCount') }}: {{ wordCount }}</span>
          <span>{{ t('speech.playground.estimatedDuration') }}: {{ estimatedDuration }}s</span>
          <span>{{ t('speech.playground.selectedSpeaker') }}: {{ currentSpeakerInfo?.name }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.speech-playground {
  @apply bg-white dark:bg-gray-900 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700;
}

/* Custom styles for audio element */
audio {
  @apply outline-none;
}

audio::-webkit-media-controls-panel {
  @apply bg-gray-100 dark:bg-gray-800;
}
</style>
