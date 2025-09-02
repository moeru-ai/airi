<script setup lang="ts">
import type { RemovableRef } from '@vueuse/core'

import {
  ProviderAdvancedSettings,
  ProviderBaseUrlInput,
  ProviderBasicSettings,
  ProviderSettingsContainer,
  ProviderSettingsLayout,
} from '@proj-airi/stage-ui/components'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const { t } = useI18n()
const router = useRouter()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore) as { providers: RemovableRef<Record<string, any>> }

// Get provider metadata
const providerId = 'koboldcpp-whisper'
const providerMetadata = computed(() => providersStore.getProviderMetadata(providerId))

// Use computed properties for settings
const baseUrl = computed({
  get: () => providers.value[providerId]?.baseUrl || '',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].baseUrl = value
  },
})

const language = computed({
  get: () => providers.value[providerId]?.language || 'auto',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].language = value
  },
})

// Available languages
const languages = ref([
  { value: 'auto', label: 'Auto Detect' },
  { value: 'en', label: 'English' },
  { value: 'ru', label: 'Russian' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'zh', label: 'Chinese' },
])

onMounted(() => {
  // Initialize provider if it doesn't exist
  providersStore.initializeProvider(providerId)

  // Initialize refs with current values
  baseUrl.value = providers.value[providerId]?.baseUrl || 'http://localhost:5001/'
  language.value = providers.value[providerId]?.language || 'auto'
})

// Watch settings and update the provider configuration
watch([baseUrl, language], () => {
  providers.value[providerId] = {
    ...providers.value[providerId],
    baseUrl: baseUrl.value,
    language: language.value,
  }
})

function handleResetSettings() {
  providers.value[providerId] = {
    baseUrl: 'http://localhost:5001/',
    language: 'auto',
  }
}

// Playground functionality
const isRecording = ref(false)
const isTranscribing = ref(false)
const transcriptionResult = ref('')
const transcriptionError = ref<string | null>(null)
const mediaRecorder = ref<MediaRecorder | null>(null)
const audioChunks = ref<Blob[]>([])

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

    // Try different audio formats in order of preference
    const supportedFormats = [
      'audio/wav',
      'audio/webm;codecs=pcm',
      'audio/webm;codecs=opus',
      'audio/mp4',
      'audio/ogg;codecs=opus',
    ]

    let selectedFormat = ''
    for (const format of supportedFormats) {
      if (MediaRecorder.isTypeSupported(format)) {
        selectedFormat = format
        break
      }
    }

    if (selectedFormat) {
      mediaRecorder.value = new MediaRecorder(stream, { mimeType: selectedFormat })
      console.warn(`Using audio format: ${selectedFormat}`)
    }
    else {
      // Fallback to default
      mediaRecorder.value = new MediaRecorder(stream)
      console.warn('Using default MediaRecorder format')
    }

    audioChunks.value = []

    mediaRecorder.value.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.value.push(event.data)
      }
    }

    mediaRecorder.value.onstop = async () => {
      // Create audio blob with proper MIME type based on what MediaRecorder actually produces
      const mimeType = mediaRecorder.value?.mimeType || 'audio/webm'
      const audioBlob = new Blob(audioChunks.value, { type: mimeType })

      console.warn(`Recorded audio: ${audioBlob.size} bytes, type: ${audioBlob.type}`)

      // Convert to WAV if necessary
      if (audioBlob.size > 0) {
        await transcribeAudio(audioBlob)
      }
      else {
        transcriptionError.value = 'Recorded audio is empty'
      }
    }

    mediaRecorder.value.start()
    isRecording.value = true
    transcriptionError.value = null
    transcriptionResult.value = ''
  }
  catch (error) {
    console.error('Recording error:', error)
    transcriptionError.value = error instanceof Error ? error.message : 'Failed to start recording'
  }
}

function stopRecording() {
  if (mediaRecorder.value && isRecording.value) {
    mediaRecorder.value.stop()
    isRecording.value = false

    // Stop all tracks to release the microphone
    const tracks = mediaRecorder.value.stream.getTracks()
    tracks.forEach(track => track.stop())
  }
}

async function transcribeAudio(audioBlob: Blob) {
  isTranscribing.value = true
  transcriptionError.value = null

  try {
    const config = providers.value[providerId]
    if (!config?.baseUrl) {
      throw new Error('Base URL is not configured')
    }

    // Import the transcription function
    const { transcribeWithKoboldCPP } = await import('@proj-airi/stage-ui/bindings/koboldcpp-whisper')

    const result = await transcribeWithKoboldCPP(config.baseUrl, {
      file: audioBlob,
      language: config.language && config.language !== 'auto' ? config.language : undefined,
      model: 'whisper-1',
    })

    transcriptionResult.value = result || 'No transcription result'
  }
  catch (error) {
    console.error('Transcription error:', error)
    transcriptionError.value = error instanceof Error ? error.message : 'Unknown error occurred'
  }
  finally {
    isTranscribing.value = false
  }
}

async function uploadAndTranscribe() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'audio/*'

  input.onchange = async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0]
    if (file) {
      await transcribeAudio(file)
    }
  }

  input.click()
}

// Test connection
const isTestingConnection = ref(false)
const connectionTestResult = ref<string | null>(null)

async function testConnection() {
  isTestingConnection.value = true
  connectionTestResult.value = null

  try {
    const config = providers.value[providerId]
    if (!config?.baseUrl) {
      throw new Error('Base URL is not configured')
    }

    // Import the connection test function
    const { testKoboldCPPConnection } = await import('@proj-airi/stage-ui/bindings/koboldcpp-whisper')
    const success = await testKoboldCPPConnection(config.baseUrl)

    if (success) {
      connectionTestResult.value = 'Connection successful! KoboldCPP server is reachable.'
    }
    else {
      throw new Error('Unable to connect to KoboldCPP server')
    }
  }
  catch (error) {
    console.error('Connection test error:', error)
    connectionTestResult.value = error instanceof Error ? error.message : 'Connection failed'
  }
  finally {
    isTestingConnection.value = false
  }
}
</script>

<template>
  <ProviderSettingsLayout
    :provider-name="providerMetadata?.localizedName"
    :provider-icon="providerMetadata?.icon"
    :on-back="() => router.back()"
  >
    <ProviderSettingsContainer>
      <ProviderBasicSettings>
        <ProviderBaseUrlInput
          v-model="baseUrl"
          :label="t('settings.pages.providers.shared.baseUrl')"
          placeholder="http://localhost:5001/"
          :description="t('settings.pages.providers.provider.koboldcpp-whisper.baseUrl.description')"
        />

        <div class="space-y-2">
          <label class="block text-sm text-gray-700 font-medium dark:text-gray-300">
            {{ t('settings.pages.providers.provider.koboldcpp-whisper.language.label') }}
          </label>
          <select
            v-model="language"
            class="block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm dark:border-gray-600 focus:border-primary-500 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-primary-500"
          >
            <option v-for="langOption in languages" :key="langOption.value" :value="langOption.value">
              {{ langOption.label }}
            </option>
          </select>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            {{ t('settings.pages.providers.provider.koboldcpp-whisper.language.description') }}
          </p>
        </div>

        <!-- Connection Test Section -->
        <div class="rounded-lg bg-gray-50 p-4 space-y-3 dark:bg-gray-800">
          <h4 class="text-sm text-gray-900 font-medium dark:text-white">
            {{ t('settings.pages.providers.provider.koboldcpp-whisper.connectionTest.title') }}
          </h4>

          <button
            type="button"
            :disabled="isTestingConnection"
            class="inline-flex items-center border border-transparent rounded-md bg-blue-600 px-4 py-2 text-sm text-white font-medium shadow-sm disabled:cursor-not-allowed hover:bg-blue-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            @click="testConnection"
          >
            <div v-if="isTestingConnection" class="mr-2 h-4 w-4 animate-spin text-white -ml-1">
              <div class="i-solar:loading-bold-duotone" />
            </div>
            <div v-else class="i-solar:wifi-router-bold-duotone mr-2 h-4 w-4 -ml-1" />
            {{ isTestingConnection ? t('settings.pages.providers.provider.koboldcpp-whisper.connectionTest.testing') : t('settings.pages.providers.provider.koboldcpp-whisper.connectionTest.test') }}
          </button>

          <div v-if="connectionTestResult" class="text-sm" :class="connectionTestResult.includes('successful') ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
            {{ connectionTestResult }}
          </div>
        </div>
      </ProviderBasicSettings>

      <ProviderAdvancedSettings>
        <button
          type="button"
          class="inline-flex items-center border border-gray-300 rounded-md bg-white px-4 py-2 text-sm text-gray-700 font-medium shadow-sm dark:border-gray-600 dark:bg-gray-700 hover:bg-gray-50 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 dark:hover:bg-gray-600"
          @click="handleResetSettings"
        >
          {{ t('settings.pages.providers.shared.resetToDefaults') }}
        </button>
      </ProviderAdvancedSettings>

      <!-- Playground Section -->
      <div class="space-y-4">
        <h3 class="text-lg text-gray-900 font-medium dark:text-white">
          {{ t('settings.pages.providers.provider.koboldcpp-whisper.playground.title') }}
        </h3>

        <div class="space-y-3">
          <div class="flex items-center space-x-3">
            <button
              v-if="!isRecording"
              type="button"
              :disabled="isTranscribing"
              class="inline-flex items-center border border-transparent rounded-md bg-red-600 px-4 py-2 text-sm text-white font-medium shadow-sm disabled:cursor-not-allowed hover:bg-red-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              @click="startRecording"
            >
              <div class="i-solar:microphone-3-bold-duotone mr-2 h-4 w-4 -ml-1" />
              {{ t('settings.pages.providers.provider.koboldcpp-whisper.playground.startRecording') }}
            </button>

            <button
              v-else
              type="button"
              class="inline-flex items-center border border-transparent rounded-md bg-gray-600 px-4 py-2 text-sm text-white font-medium shadow-sm hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
              @click="stopRecording"
            >
              <div class="i-solar:stop-bold-duotone mr-2 h-4 w-4 -ml-1" />
              {{ t('settings.pages.providers.provider.koboldcpp-whisper.playground.stopRecording') }}
            </button>

            <button
              type="button"
              :disabled="isTranscribing || isRecording"
              class="inline-flex items-center border border-gray-300 rounded-md bg-white px-4 py-2 text-sm text-gray-700 font-medium shadow-sm disabled:cursor-not-allowed dark:border-gray-600 dark:bg-gray-700 hover:bg-gray-50 dark:text-gray-300 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 dark:hover:bg-gray-600"
              @click="uploadAndTranscribe"
            >
              <div class="i-solar:upload-bold-duotone mr-2 h-4 w-4 -ml-1" />
              {{ t('settings.pages.providers.provider.koboldcpp-whisper.playground.uploadAudio') }}
            </button>
          </div>

          <div v-if="isRecording" class="flex items-center text-red-600 space-x-2">
            <div class="animate-pulse">
              <div class="i-solar:record-bold-duotone h-4 w-4" />
            </div>
            <span class="text-sm font-medium">{{ t('settings.pages.providers.provider.koboldcpp-whisper.playground.recording') }}</span>
          </div>

          <div v-if="isTranscribing" class="flex items-center text-blue-600 space-x-2">
            <div class="animate-spin">
              <div class="i-solar:loading-bold-duotone h-4 w-4" />
            </div>
            <span class="text-sm font-medium">{{ t('settings.pages.providers.provider.koboldcpp-whisper.playground.transcribing') }}</span>
          </div>

          <div v-if="transcriptionResult" class="space-y-2">
            <label class="block text-sm text-gray-700 font-medium dark:text-gray-300">
              {{ t('settings.pages.providers.provider.koboldcpp-whisper.playground.result') }}
            </label>
            <div class="border rounded-md bg-gray-50 p-3 dark:bg-gray-800">
              <p class="text-sm text-gray-900 dark:text-white">
                {{ transcriptionResult }}
              </p>
            </div>
          </div>

          <div v-if="transcriptionError" class="rounded-md bg-red-50 p-4 dark:bg-red-900/20">
            <div class="flex">
              <div class="i-solar:danger-triangle-bold h-5 w-5 text-red-400" />
              <div class="ml-3">
                <h3 class="text-sm text-red-800 font-medium dark:text-red-200">
                  {{ t('settings.pages.providers.provider.koboldcpp-whisper.playground.error') }}
                </h3>
                <div class="mt-2 text-sm text-red-700 dark:text-red-300">
                  {{ transcriptionError }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ProviderSettingsContainer>
  </ProviderSettingsLayout>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
