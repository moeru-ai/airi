<script setup lang="ts">
import type { SileroTTSConfig } from '@proj-airi/stage-ui/stores/modules/speech'

import SpeechProviderSettings from '@proj-airi/stage-ui/components/Scenarios/Providers/SpeechProviderSettings.vue'

import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

defineOptions({
  name: 'SileroTTSSettings',
})

const { t } = useI18n()
const speechStore = useSpeechStore()

// Advanced settings
const advancedSettings = ref({
  pitch: 1.0,
  speed: 1.0,
  timeout: 30,
  autoRetry: true,
})

// Server status
const serverStatus = ref({
  isOnline: false,
  lastTest: null as Date | null,
})

// Methods
function updateConfig(config: Partial<SileroTTSConfig>) {
  speechStore.updateConfig(config)
}

async function testConnection(): Promise<boolean> {
  const isConnected = await speechStore.testConnection()
  serverStatus.value.isOnline = isConnected
  serverStatus.value.lastTest = new Date()
  return isConnected
}

async function playSample(speakerName: string): Promise<void> {
  await speechStore.playSample(speakerName)
}

async function generateSpeech(text: string): Promise<string> {
  return await speechStore.generateSpeech({ text })
}

async function playSpeech(audioUrl: string): Promise<void> {
  await speechStore.playSpeech(audioUrl)
}

function updateAdvancedSettings() {
  // Here you could save advanced settings to localStorage or send to store
  console.warn('Advanced settings updated:', advancedSettings.value)
}

async function refreshSpeakers() {
  await speechStore.fetchSpeakers()
}

async function testAllSpeakers() {
  for (const speaker of speechStore.availableSpeakers) {
    try {
      await speechStore.playSample(speaker.name)
      // Add small delay between samples
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
    catch (error) {
      console.error(`Failed to test speaker ${speaker.name}:`, error)
    }
  }
}

function resetToDefaults() {
  speechStore.updateConfig({
    baseUrl: 'http://127.0.0.1:8001',
    speaker: 'baya',
    sampleRate: 48000,
    format: 'wav',
  })

  advancedSettings.value = {
    pitch: 1.0,
    speed: 1.0,
    timeout: 30,
    autoRetry: true,
  }
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('ru', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
}

// Initialize
onMounted(async () => {
  await testConnection()
})
</script>

<template>
  <div class="silero-tts-settings">
    <SpeechProviderSettings
      :title="t('settings.pages.providers.provider.silero-tts.title')"
      :description="t('settings.pages.providers.provider.silero-tts.description')"
      :config="speechStore.sileroConfig"
      :available-speakers="speechStore.availableSpeakers"
      default-base-url="http://127.0.0.1:8001"
      @update:config="updateConfig"
      @test-connection="testConnection"
      @play-sample="playSample"
      @generate-speech="generateSpeech"
      @play-speech="playSpeech"
    >
      <template #advanced>
        <!-- Advanced Silero TTS specific settings -->
        <div class="space-y-4">
          <h4 class="text-md text-gray-900 font-medium dark:text-white">
            {{ t('settings.pages.providers.provider.silero-tts.advanced.title') }}
          </h4>

          <!-- Additional Voice Settings -->
          <div>
            <label class="mb-2 block text-sm text-gray-700 font-medium dark:text-gray-300">
              {{ t('settings.pages.providers.provider.silero-tts.advanced.pitch') }}
            </label>
            <input
              v-model.number="advancedSettings.pitch"
              type="range"
              min="0.5"
              max="2.0"
              step="0.1"
              class="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 dark:bg-gray-700"
              @input="updateAdvancedSettings"
            >
            <div class="mt-1 flex justify-between text-xs text-gray-500">
              <span>0.5</span>
              <span>{{ advancedSettings.pitch }}</span>
              <span>2.0</span>
            </div>
          </div>

          <div>
            <label class="mb-2 block text-sm text-gray-700 font-medium dark:text-gray-300">
              {{ t('settings.pages.providers.provider.silero-tts.advanced.speed') }}
            </label>
            <input
              v-model.number="advancedSettings.speed"
              type="range"
              min="0.5"
              max="2.0"
              step="0.1"
              class="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 dark:bg-gray-700"
              @input="updateAdvancedSettings"
            >
            <div class="mt-1 flex justify-between text-xs text-gray-500">
              <span>0.5</span>
              <span>{{ advancedSettings.speed }}</span>
              <span>2.0</span>
            </div>
          </div>

          <!-- Connection Pool Settings -->
          <div>
            <label class="mb-2 block text-sm text-gray-700 font-medium dark:text-gray-300">
              {{ t('settings.pages.providers.provider.silero-tts.advanced.timeout') }}
            </label>
            <input
              v-model.number="advancedSettings.timeout"
              type="number"
              min="5"
              max="60"
              class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm shadow-sm dark:border-gray-600 focus:border-blue-500 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              @input="updateAdvancedSettings"
            >
            <p class="mt-1 text-xs text-gray-500">
              {{ t('settings.pages.providers.provider.silero-tts.advanced.timeoutHelp') }}
            </p>
          </div>

          <!-- Auto-retry Settings -->
          <div class="flex items-center">
            <input
              id="auto-retry"
              v-model="advancedSettings.autoRetry"
              type="checkbox"
              class="h-4 w-4 border-gray-300 rounded text-blue-600 focus:ring-blue-500"
              @change="updateAdvancedSettings"
            >
            <label for="auto-retry" class="ml-2 block text-sm text-gray-900 dark:text-white">
              {{ t('settings.pages.providers.provider.silero-tts.advanced.autoRetry') }}
            </label>
          </div>
        </div>
      </template>
    </SpeechProviderSettings>

    <!-- Server Status -->
    <div class="mt-6 border border-gray-200 rounded-lg p-4 dark:border-gray-700">
      <h4 class="text-md mb-3 text-gray-900 font-medium dark:text-white">
        {{ t('settings.pages.providers.provider.silero-tts.status.title') }}
      </h4>

      <div class="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span class="text-gray-600 dark:text-gray-400">
            {{ t('settings.pages.providers.provider.silero-tts.status.server') }}:
          </span>
          <span class="ml-2 font-medium" :class="serverStatus.isOnline ? 'text-green-600' : 'text-red-600'">
            {{ serverStatus.isOnline ? t('common.online') : t('common.offline') }}
          </span>
        </div>

        <div>
          <span class="text-gray-600 dark:text-gray-400">
            {{ t('settings.pages.providers.provider.silero-tts.status.speakers') }}:
          </span>
          <span class="ml-2 text-gray-900 font-medium dark:text-white">
            {{ speechStore.availableSpeakers.length }}
          </span>
        </div>

        <div>
          <span class="text-gray-600 dark:text-gray-400">
            {{ t('settings.pages.providers.provider.silero-tts.status.lastTest') }}:
          </span>
          <span class="ml-2 text-gray-900 font-medium dark:text-white">
            {{ serverStatus.lastTest ? formatTime(serverStatus.lastTest) : t('common.never') }}
          </span>
        </div>

        <div>
          <span class="text-gray-600 dark:text-gray-400">
            {{ t('settings.pages.providers.provider.silero-tts.status.currentSpeaker') }}:
          </span>
          <span class="ml-2 text-gray-900 font-medium dark:text-white">
            {{ speechStore.currentSpeaker?.description || speechStore.sileroConfig.speaker }}
          </span>
        </div>
      </div>
    </div>

    <!-- Quick Actions -->
    <div class="mt-6 rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
      <h4 class="text-md mb-3 text-gray-900 font-medium dark:text-white">
        {{ t('settings.pages.providers.provider.silero-tts.actions.title') }}
      </h4>

      <div class="grid grid-cols-3 gap-3">
        <button
          type="button"
          :disabled="!speechStore.isReady"
          class="rounded-md bg-blue-600 px-4 py-2 text-sm text-white font-medium disabled:cursor-not-allowed hover:bg-blue-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          @click="refreshSpeakers"
        >
          {{ t('settings.pages.providers.provider.silero-tts.actions.refreshSpeakers') }}
        </button>

        <button
          type="button"
          :disabled="!speechStore.isReady"
          class="rounded-md bg-green-600 px-4 py-2 text-sm text-white font-medium disabled:cursor-not-allowed hover:bg-green-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-green-500"
          @click="testAllSpeakers"
        >
          {{ t('settings.pages.providers.provider.silero-tts.actions.testAllSpeakers') }}
        </button>

        <button
          type="button"
          class="rounded-md bg-gray-600 px-4 py-2 text-sm text-white font-medium hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
          @click="resetToDefaults"
        >
          {{ t('settings.pages.providers.provider.silero-tts.actions.resetDefaults') }}
        </button>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  title: Silero TTS
  description: Настройки синтеза речи Silero TTS
  icon: i-solar:microphone-bold-duotone
  section: providers
  subsection: speech
</route>

<style scoped>
.silero-tts-settings {
  @apply space-y-6;
}
</style>
