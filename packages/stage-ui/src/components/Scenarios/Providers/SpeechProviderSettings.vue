<script setup lang="ts">
import type { SileroSpeaker, SileroTTSConfig } from '../../../stores/modules/speech'

import { useDebounceFn } from '@vueuse/core'
import { computed, ref, watch } from 'vue'

interface Props {
  title: string
  description: string
  config: SileroTTSConfig
  availableSpeakers: SileroSpeaker[]
  defaultBaseUrl: string
  canPlaySample?: boolean
}

interface Emits {
  (e: 'update:config', config: Partial<SileroTTSConfig>): void
  (e: 'testConnection'): Promise<boolean>
  (e: 'playSample', speakerName: string): Promise<void>
  (e: 'generateSpeech', text: string): Promise<string>
  (e: 'playSpeech', audioUrl: string): Promise<void>
}

const props = withDefaults(defineProps<Props>(), {
  canPlaySample: true,
})

const emit = defineEmits<Emits>()

// Local config for editing
const localConfig = ref<SileroTTSConfig>({ ...props.config })

// Test playground
const testText = ref('Привет! Это тест синтеза речи.')
const testAudioUrl = ref<string | null>(null)
const isGeneratingTest = ref(false)
const isPlayingTest = ref(false)
const testError = ref<string | null>(null)

// Connection state
const isTestingConnection = ref(false)
const connectionStatus = ref<'connected' | 'disconnected' | 'unknown'>('unknown')
const connectionError = ref<string | null>(null)
const isPlayingSample = ref(false)

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
const debouncedConfigUpdate = useDebounceFn((config: Partial<SileroTTSConfig>) => {
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

async function playSample() {
  isPlayingSample.value = true

  try {
    await emit('playSample', localConfig.value.speaker)
  }
  catch (error) {
    console.error('Failed to play sample:', error)
  }
  finally {
    isPlayingSample.value = false
  }
}

async function generateTestSpeech() {
  if (!testText.value.trim())
    return

  isGeneratingTest.value = true
  testError.value = null
  testAudioUrl.value = null

  try {
    const audioUrl = await emit('generateSpeech', testText.value)
    testAudioUrl.value = audioUrl
  }
  catch (error) {
    testError.value = error instanceof Error ? error.message : 'Ошибка генерации речи'
  }
  finally {
    isGeneratingTest.value = false
  }
}

async function playTestSpeech() {
  if (!testAudioUrl.value)
    return

  isPlayingTest.value = true

  try {
    await emit('playSpeech', testAudioUrl.value)
  }
  catch (error) {
    testError.value = error instanceof Error ? error.message : 'Ошибка воспроизведения'
  }
  finally {
    isPlayingTest.value = false
  }
}

// Initialize connection test
testConnection()
</script>

<template>
  <div class="speech-provider-settings">
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
      <!-- Base URL -->
      <div>
        <label class="mb-2 block text-sm text-gray-700 font-medium dark:text-gray-300">
          {{ $t('speech.settings.baseUrl') }}
        </label>
        <div class="flex space-x-2">
          <input
            v-model="localConfig.baseUrl"
            type="url"
            class="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm shadow-sm dark:border-gray-600 focus:border-blue-500 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400"
            :placeholder="defaultBaseUrl"
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
              {{ $t('speech.settings.testing') }}
            </div>
            <span v-else>{{ $t('speech.settings.test') }}</span>
          </button>
        </div>
        <p v-if="connectionError" class="mt-1 text-sm text-red-600 dark:text-red-400">
          {{ connectionError }}
        </p>
      </div>

      <!-- Speaker Selection -->
      <div>
        <label class="mb-2 block text-sm text-gray-700 font-medium dark:text-gray-300">
          {{ $t('speech.settings.speaker') }}
        </label>
        <div class="flex space-x-2">
          <select
            v-model="localConfig.speaker"
            class="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm shadow-sm dark:border-gray-600 focus:border-blue-500 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            @change="onConfigChange"
          >
            <option v-for="speaker in availableSpeakers" :key="speaker.name" :value="speaker.name">
              {{ speaker.description || speaker.name }}
            </option>
          </select>
          <button
            v-if="canPlaySample"
            type="button"
            :disabled="isPlayingSample"
            class="rounded-md bg-green-600 px-4 py-2 text-sm text-white font-medium disabled:cursor-not-allowed hover:bg-green-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-green-500"
            @click="playSample"
          >
            <div v-if="isPlayingSample" class="flex items-center">
              <div class="mr-2 h-4 w-4 animate-spin border-2 border-white border-t-transparent rounded-full" />
              {{ $t('speech.settings.playing') }}
            </div>
            <span v-else>{{ $t('speech.settings.sample') }}</span>
          </button>
        </div>
      </div>

      <!-- Sample Rate -->
      <div>
        <label class="mb-2 block text-sm text-gray-700 font-medium dark:text-gray-300">
          {{ $t('speech.settings.sampleRate') }}
        </label>
        <select
          v-model.number="localConfig.sampleRate"
          class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm shadow-sm dark:border-gray-600 focus:border-blue-500 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          @change="onConfigChange"
        >
          <option :value="8000">
            8 kHz
          </option>
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

      <!-- Audio Format -->
      <div>
        <label class="mb-2 block text-sm text-gray-700 font-medium dark:text-gray-300">
          {{ $t('speech.settings.format') }}
        </label>
        <select
          v-model="localConfig.format"
          class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm shadow-sm dark:border-gray-600 focus:border-blue-500 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          @change="onConfigChange"
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

      <!-- Test Playground -->
      <div class="border-t pt-6">
        <label class="mb-2 block text-sm text-gray-700 font-medium dark:text-gray-300">
          {{ $t('speech.settings.testPlayground') }}
        </label>
        <div class="space-y-3">
          <textarea
            v-model="testText"
            rows="3"
            class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm shadow-sm dark:border-gray-600 focus:border-blue-500 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400"
            :placeholder="$t('speech.settings.testTextPlaceholder')"
          />
          <div class="flex space-x-2">
            <button
              type="button"
              :disabled="!testText.trim() || isGeneratingTest"
              class="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm text-white font-medium disabled:cursor-not-allowed hover:bg-blue-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              @click="generateTestSpeech"
            >
              <div v-if="isGeneratingTest" class="flex items-center justify-center">
                <div class="mr-2 h-4 w-4 animate-spin border-2 border-white border-t-transparent rounded-full" />
                {{ $t('speech.settings.generating') }}
              </div>
              <span v-else>{{ $t('speech.settings.generate') }}</span>
            </button>
            <button
              v-if="testAudioUrl"
              type="button"
              :disabled="isPlayingTest"
              class="rounded-md bg-green-600 px-4 py-2 text-sm text-white font-medium disabled:cursor-not-allowed hover:bg-green-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-green-500"
              @click="playTestSpeech"
            >
              <div v-if="isPlayingTest" class="flex items-center">
                <div class="mr-2 h-4 w-4 animate-spin border-2 border-white border-t-transparent rounded-full" />
                {{ $t('speech.settings.playing') }}
              </div>
              <span v-else>{{ $t('speech.settings.play') }}</span>
            </button>
          </div>
        </div>
        <p v-if="testError" class="mt-2 text-sm text-red-600 dark:text-red-400">
          {{ testError }}
        </p>
      </div>
    </div>

    <!-- Advanced Settings Slot -->
    <div v-if="$slots.advanced" class="mt-6 border-t pt-6">
      <slot name="advanced" />
    </div>
  </div>
</template>

<style scoped>
.speech-provider-settings {
  @apply bg-white dark:bg-gray-900 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700;
}
</style>
