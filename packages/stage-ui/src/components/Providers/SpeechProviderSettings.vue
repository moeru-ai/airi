<script setup lang="ts">
import type { SpeechProviderWithExtraOptions } from '@xsai-ext/shared-providers'

import { useDebounceFn } from '@vueuse/core'
import { generateSpeech } from '@xsai/generate-speech'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { useProvidersStore, useSpeechStore } from '../../stores'
import {
  ProviderAdvancedSettings,
  ProviderApiKeyInput,
  ProviderBaseUrlInput,
  ProviderBasicSettings,
  ProviderSettingsContainer,
} from '../index'
import ProviderSettingsLayout2 from './ProviderSettingsLayout2.vue'

const props = defineProps<{
  providerId: string
  // Default model to use if not specified in provider settings
  defaultModel?: string
  // Additional provider-specific settings
  additionalSettings?: Record<string, any>
}>()

// Expose slots and emit events to allow customization
defineSlots<{
  'basic-settings': (props: any) => any
  'voice-settings': (props: any) => any
  'advanced-settings': (props: any) => any
  'playground': (props: {
    isGenerating: boolean
    testText: string
    useSSML: boolean
    ssmlText: string
    generateTestSpeech: () => Promise<void>
    stopTestAudio: () => void
    audioUrl: string
    audioPlayer: HTMLAudioElement | null
    errorMessage: string
  }) => any
}>()
const { t } = useI18n()
const router = useRouter()
const providersStore = useProvidersStore()
const speechStore = useSpeechStore()
const { providers } = storeToRefs(providersStore)

// Get provider metadata
const providerMetadata = computed(() => providersStore.getProviderMetadata(props.providerId))

// Common provider settings
const apiKey = computed({
  get: () => providers.value[props.providerId]?.apiKey as string | undefined || '',
  set: (value) => {
    if (!providers.value[props.providerId])
      providers.value[props.providerId] = {}

    providers.value[props.providerId].apiKey = value
  },
})

const baseUrl = computed({
  get: () => providers.value[props.providerId]?.baseUrl as string | undefined || providerMetadata.value?.defaultOptions?.().baseUrl as string | undefined || '',
  set: (value) => {
    if (!providers.value[props.providerId])
      providers.value[props.providerId] = {}

    providers.value[props.providerId].baseUrl = value
  },
})

// For playground
const testText = ref('Hello! This is a test of voice synthesis.')
const isGenerating = ref(false)
const audioUrl = ref('')
const errorMessage = ref('')
const audioPlayer = ref<HTMLAudioElement | null>(null)
const useSSML = ref(false)
const ssmlText = ref('')
const activeSpeechVoice = ref('')

// Voice settings as reactive objects to allow for different provider settings
const voiceSettings = ref<Record<string, any>>({})

// Initialize voice settings with defaults or from provider
function initializeVoiceSettings() {
  if (providers.value[props.providerId]?.voiceSettings) {
    voiceSettings.value = { ...(providers.value[props.providerId].voiceSettings as Record<string, any> | undefined) }
  }
  else {
    // Default values that most providers use
    voiceSettings.value = {
      pitch: 0,
      speed: 1.0,
      volume: 0,
      // Provider-specific defaults can be set in the onMounted lifecycle
      ...props.additionalSettings,
    }
  }
}

onMounted(() => {
  providersStore.initializeProvider(props.providerId)

  // Initialize refs with current values
  apiKey.value = providers.value[props.providerId]?.apiKey as string | undefined || ''
  baseUrl.value = providers.value[props.providerId]?.baseUrl as string | undefined || providerMetadata.value?.defaultOptions?.().baseUrl as string | undefined || ''

  // Initialize voice settings
  initializeVoiceSettings()

  // Load voices if provider is configured
  if (providersStore.configuredProviders[props.providerId]) {
    speechStore.loadVoicesForProvider(props.providerId)
  }
})

const debouncedUpdate = useDebounceFn(() => {
  providers.value[props.providerId] = {
    ...providers.value[props.providerId],
    apiKey: apiKey.value,
    baseUrl: baseUrl.value || providerMetadata.value?.defaultOptions?.().baseUrl || '',
    voiceSettings: { ...voiceSettings.value },
  }
}, 1000)

// Watch all settings and update the provider configuration
watch([apiKey, baseUrl], debouncedUpdate)

// Watch voice settings for changes
watch(voiceSettings, debouncedUpdate, { deep: true })

// Function to generate speech
async function generateTestSpeech() {
  if (!testText.value.trim() && !useSSML.value)
    return

  if (useSSML.value && !ssmlText.value.trim())
    return

  const provider = providersStore.getProviderInstance(props.providerId) as SpeechProviderWithExtraOptions<string, any>
  if (!provider) {
    console.error('Failed to initialize speech provider')
    return
  }

  if (!activeSpeechVoice.value) {
    console.error('No active speech voice selected')
    return
  }

  isGenerating.value = true
  errorMessage.value = ''

  try {
    // Stop any currently playing audio
    if (audioUrl.value) {
      stopTestAudio()
    }

    // Get the appropriate model (default or from provider settings)
    const modelToUse = props.defaultModel || 'default'

    const input = useSSML.value
      ? ssmlText.value
      : testText.value

    const response = await generateSpeech({
      ...provider.speech(modelToUse, {
        voiceSettings: voiceSettings.value,
      }),
      input,
      voice: activeSpeechVoice.value,
    })

    // Convert the response to a blob and create an object URL
    audioUrl.value = URL.createObjectURL(new Blob([response]))

    // Play the audio
    setTimeout(() => {
      if (audioPlayer.value) {
        audioPlayer.value.play()
      }
    }, 100)
  }
  catch (error) {
    console.error('Error generating speech:', error)
    errorMessage.value = error instanceof Error ? error.message : 'An unknown error occurred'
  }
  finally {
    isGenerating.value = false
  }
}

// Function to stop audio playback
function stopTestAudio() {
  if (audioPlayer.value) {
    audioPlayer.value.pause()
    audioPlayer.value.currentTime = 0
  }

  // Clean up the object URL to prevent memory leaks
  if (audioUrl.value) {
    URL.revokeObjectURL(audioUrl.value)
    audioUrl.value = ''
  }
}

// Clean up when component is unmounted
onUnmounted(() => {
  if (audioUrl.value) {
    URL.revokeObjectURL(audioUrl.value)
  }
})

function handleResetVoiceSettings() {
  voiceSettings.value = { ...(providerMetadata.value?.defaultOptions?.().voiceSettings || {}) }
  debouncedUpdate()
}

// Helper function to update a specific voice setting
function updateVoiceSetting(key: string, value: any) {
  voiceSettings.value[key] = value
}

// Expose provider-specific data for slot usage
const slotData = computed(() => ({
  voiceSettings: voiceSettings.value,
  updateVoiceSettings: updateVoiceSetting,
  isGenerating: isGenerating.value,
  testText: testText.value,
  useSSML: useSSML.value,
  ssmlText: ssmlText.value,
  generateTestSpeech,
  stopTestAudio,
  audioUrl: audioUrl.value,
  audioPlayer: audioPlayer.value,
  errorMessage: errorMessage.value,
}))
</script>

<template>
  <ProviderSettingsLayout2
    :provider-name="providerMetadata?.localizedName"
    :provider-icon="providerMetadata?.icon"
    :on-back="() => router.back()"
  >
    <div flex="~ col md:row gap-6">
      <ProviderSettingsContainer class="w-full md:w-[40%]">
        <!-- Basic settings section -->
        <ProviderBasicSettings
          :title="t('settings.pages.providers.common.section.basic.title')"
          :description="t('settings.pages.providers.common.section.basic.description')"
          :on-reset="handleResetVoiceSettings"
        >
          <ProviderApiKeyInput v-model="apiKey" :provider-name="providerMetadata?.localizedName" placeholder="sk-" />
          <!-- Slot for provider-specific basic settings -->
          <slot name="basic-settings" />
        </ProviderBasicSettings>

        <!-- Voice settings section -->
        <div flex="~ col gap-6">
          <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-400">
            {{ t('settings.pages.providers.common.section.voice.title') }}
          </h2>
          <div flex="~ col gap-4">
            <!-- Common voice settings with ranges -->
            <slot name="voice-settings" v-bind="slotData" />
          </div>
        </div>

        <!-- Advanced settings section -->
        <ProviderAdvancedSettings :title="t('settings.pages.providers.common.section.advanced.title')">
          <ProviderBaseUrlInput
            v-model="baseUrl"
            :placeholder="providerMetadata?.defaultOptions?.().baseUrl as string || ''" required
          />
          <!-- Slot for provider-specific advanced settings -->
          <slot name="advanced-settings" />
        </ProviderAdvancedSettings>
      </ProviderSettingsContainer>

      <!-- Playground section -->
      <div flex="~ col gap-6" class="w-full md:w-[60%]">
        <div w-full rounded-xl>
          <!-- Custom playground slot -->
          <slot name="playground" v-bind="slotData" />
        </div>
      </div>
    </div>
  </ProviderSettingsLayout2>
</template>
