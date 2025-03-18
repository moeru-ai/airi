<script setup lang="ts">
import type { Voice } from '@proj-airi/stage-ui/constants'
import type { RemovableRef } from '@vueuse/core'
import type { UnMicrosoftOptions } from '@xsai-ext/providers-local'
import type { SpeechProviderWithExtraOptions } from '@xsai-ext/shared-providers'

import {
  FieldCheckbox,
  FieldInput,
  FieldRange,
  ProviderAdvancedSettings,
  ProviderApiKeyInput,
  ProviderBaseUrlInput,
  ProviderBasicSettings,
  ProviderSettingsContainer,
  ProviderSettingsLayout,
  TestDummyMarker,
} from '@proj-airi/stage-ui/components'
import { voiceMap } from '@proj-airi/stage-ui/constants'
import { useProvidersStore, useSpeechStore } from '@proj-airi/stage-ui/stores'
import { generateSpeech } from '@xsai/generate-speech'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const { t } = useI18n()
const router = useRouter()
const providersStore = useProvidersStore()
const speechStore = useSpeechStore()
const { providers } = storeToRefs(providersStore) as { providers: RemovableRef<Record<string, any>> }

// For playground
const testText = ref('Hello! This is a test of the Microsoft Speech voice synthesis.')
const isGenerating = ref(false)
const audioUrl = ref('')
const errorMessage = ref('')
const audioPlayer = ref<HTMLAudioElement | null>(null)

// Get provider metadata
const providerId = 'microsoft-speech'
const providerMetadata = computed(() => providersStore.getProviderMetadata(providerId))

const apiKey = computed({
  get: () => providers.value[providerId]?.apiKey || '',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}

    providers.value[providerId].apiKey = value
  },
})

const baseUrl = computed({
  get: () => providers.value[providerId]?.baseUrl || providerMetadata.value?.defaultOptions?.baseUrl || '',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}

    providers.value[providerId].baseUrl = value
  },
})

const region = computed({
  get: () => providers.value[providerId]?.region || providerMetadata.value?.defaultOptions?.region || '',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}

    providers.value[providerId].region = value
  },
})

// Voice settings as individual computed properties
const similarityBoost = computed({
  get: () => (providers.value[providerId]?.voiceSettings as any)?.similarityBoost ?? 0.75,
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    if (!providers.value[providerId].voiceSettings)
      providers.value[providerId].voiceSettings = {}

    providers.value[providerId].voiceSettings.similarityBoost = value
  },
})

const stability = computed({
  get: () => (providers.value[providerId]?.voiceSettings as any)?.stability ?? 0.5,
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    if (!providers.value[providerId].voiceSettings)
      providers.value[providerId].voiceSettings = {}

    providers.value[providerId].voiceSettings.stability = value
  },
})

const speed = computed({
  get: () => (providers.value[providerId]?.voiceSettings as any)?.speed ?? 1.0,
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    if (!providers.value[providerId].voiceSettings)
      providers.value[providerId].voiceSettings = {}

    providers.value[providerId].voiceSettings.speed = value
  },
})

const style = computed({
  get: () => (providers.value[providerId]?.voiceSettings as any)?.style ?? 0,
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    if (!providers.value[providerId].voiceSettings)
      providers.value[providerId].voiceSettings = {}

    providers.value[providerId].style = value
  },
})

const useSpeakerBoost = computed({
  get: () => (providers.value[providerId]?.voiceSettings as any)?.useSpeakerBoost !== false,
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    if (!providers.value[providerId].voiceSettings)
      providers.value[providerId].voiceSettings = {}

    providers.value[providerId].voiceSettings.useSpeakerBoost = value
  },
})

// Speech settings
const selectedLanguage = ref(speechStore.selectedLanguage)
const selectedVoice = ref(speechStore.voiceName)
const availableVoices = computed(() => speechStore.availableVoicesForLanguage)

onMounted(() => {
  providersStore.initializeProvider(providerId)

  // Initialize refs with current values
  apiKey.value = providers.value[providerId]?.apiKey || ''
  baseUrl.value = providers.value[providerId]?.baseUrl || providerMetadata.value?.defaultOptions?.baseUrl || ''

  // Initialize voice settings refs
  if (providers.value[providerId]?.voiceSettings) {
    similarityBoost.value = (providers.value[providerId].voiceSettings as any)?.similarityBoost ?? 0.75
    stability.value = (providers.value[providerId].voiceSettings as any)?.stability ?? 0.5
    speed.value = (providers.value[providerId].voiceSettings as any)?.speed ?? 1.0
    style.value = (providers.value[providerId].voiceSettings as any)?.style ?? 0
    useSpeakerBoost.value = (providers.value[providerId].voiceSettings as any)?.useSpeakerBoost !== false
  }

  // Load voices if provider is configured
  if (providersStore.configuredProviders[providerId]) {
    speechStore.loadVoicesForProvider(providerId)
  }
})

// Watch all settings and update the provider configuration
watch([apiKey, baseUrl, similarityBoost, stability, speed, style, useSpeakerBoost], () => {
  providers.value[providerId] = {
    ...providers.value[providerId],
    apiKey: apiKey.value,
    baseUrl: baseUrl.value || providerMetadata.value?.defaultOptions?.baseUrl || '',
  }
})

// Function to generate speech
async function generateTestSpeech() {
  if (!testText.value.trim())
    return

  const provider = providersStore.getProviderInstance(providerId) as SpeechProviderWithExtraOptions<string, UnMicrosoftOptions>
  if (!provider) {
    console.error('Failed to initialize speech provider')
    return
  }

  isGenerating.value = true
  errorMessage.value = ''

  try {
    // Stop any currently playing audio
    if (audioUrl.value) {
      stopTestAudio()
    }

    const response = await generateSpeech({
      ...provider.speech('v1'),
      input: testText.value,
      voice: voiceMap[selectedVoice.value as Voice],
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
  providers.value[providerId] = {
    ...(providerMetadata.value?.defaultOptions as any),
  }
}
</script>

<template>
  <ProviderSettingsLayout
    :provider-name="providerMetadata?.localizedName" :provider-icon="providerMetadata?.icon"
    :on-back="() => router.back()"
  >
    <div flex="~ col md:row gap-6">
      <ProviderSettingsContainer class="w-full md:w-[40%]">
        <ProviderBasicSettings
          :title="t('settings.pages.providers.common.section.basic.title')"
          :description="t('settings.pages.providers.common.section.basic.description')"
          :on-reset="handleResetVoiceSettings"
        >
          <ProviderApiKeyInput v-model="apiKey" :provider-name="providerMetadata?.localizedName" placeholder="sk-" />
          <FieldInput
            v-model="region"
            label="Region"
            description="Speech Service region"
            placeholder="eastasia"
            required
            type="text"
          />
        </ProviderBasicSettings>

        <div flex="~ col gap-6">
          <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-400">
            {{ t('settings.pages.providers.common.section.voice.title') }}
          </h2>
          <div flex="~ col gap-4">
            <FieldRange
              v-model="similarityBoost"
              :label="t('settings.pages.providers.provider.elevenlabs.fields.field.simularity-boost.label')"
              :description="t('settings.pages.providers.provider.elevenlabs.fields.field.simularity-boost.description')"
              :min="0" :max="1" :step="0.01"
            />

            <FieldRange
              v-model="stability"
              :label="t('settings.pages.providers.provider.elevenlabs.fields.field.stability.label')"
              :description="t('settings.pages.providers.provider.elevenlabs.fields.field.stability.description')"
              :min="0" :max="1" :step="0.01"
            />

            <FieldRange
              v-model="speed"
              :label="t('settings.pages.providers.provider.elevenlabs.fields.field.speed.label')"
              :description="t('settings.pages.providers.provider.elevenlabs.fields.field.speed.description')" :min="0.7"
              :max="1.2" :step="0.01"
            />

            <FieldRange
              v-model="style"
              :label="t('settings.pages.providers.provider.elevenlabs.fields.field.style.label')"
              :description="t('settings.pages.providers.provider.elevenlabs.fields.field.style.description')" :min="0"
              :max="1" :step="0.01"
            />

            <FieldCheckbox
              v-model="useSpeakerBoost"
              :label="t('settings.pages.providers.provider.elevenlabs.fields.field.speaker-boost.label')"
              :description="t('settings.pages.providers.provider.elevenlabs.fields.field.speaker-boost.description')"
            />
          </div>
        </div>

        <ProviderAdvancedSettings :title="t('settings.pages.providers.common.section.advanced.title')">
          <ProviderBaseUrlInput
            v-model="baseUrl"
            :placeholder="providerMetadata?.defaultOptions?.baseUrl as string || ''" required
          />
        </ProviderAdvancedSettings>
      </ProviderSettingsContainer>

      <div flex="~ col gap-6" class="w-full md:w-[60%]">
        <div w-full rounded-xl>
          <h2 class="mb-4 text-lg text-neutral-500 md:text-2xl dark:text-neutral-400" w-full>
            <div class="inline-flex items-center gap-4">
              <TestDummyMarker />
              <div>
                {{ t('settings.pages.providers.provider.elevenlabs.playground.title') }}
              </div>
            </div>
          </h2>
          <div flex="~ col gap-4">
            <textarea
              v-model="testText"
              :placeholder="t('settings.pages.providers.provider.elevenlabs.playground.fields.field.input.placeholder')"
              border="neutral-100 dark:neutral-800 solid 2 focus:neutral-200 dark:focus:neutral-700"
              transition="all duration-250 ease-in-out"
              bg="neutral-100 dark:neutral-800 focus:neutral-50 dark:focus:neutral-900"
              h-24 w-full rounded-lg px-3 py-2 text-sm outline-none
            />
            <div flex="~ col gap-6">
              <label grid="~ cols-2 gap-4">
                <div>
                  <div class="flex items-center gap-1 text-sm font-medium">
                    {{ t('settings.pages.providers.provider.elevenlabs.playground.fields.field.language.label') }}
                  </div>
                  <div class="text-xs text-neutral-500 dark:text-neutral-400">
                    {{ t('settings.pages.providers.provider.elevenlabs.playground.fields.field.language.description') }}
                  </div>
                </div>
                <select
                  v-model="selectedLanguage"
                  border="neutral-300 dark:neutral-800 solid 2 focus:neutral-400 dark:focus:neutral-600"
                  transition="border duration-250 ease-in-out" w-full rounded-lg px-2 py-1 text-nowrap text-sm
                  outline-none
                >
                  <option v-for="language in speechStore.availableLanguages" :key="language" :value="language">
                    {{ language }}
                  </option>
                </select>
              </label>

              <label grid="~ cols-2 gap-4">
                <div>
                  <div class="flex items-center gap-1 text-sm font-medium">
                    {{ t('settings.pages.providers.provider.elevenlabs.playground.fields.field.voice.label') }}
                  </div>
                  <div class="text-xs text-neutral-500 dark:text-neutral-400">
                    {{ t('settings.pages.providers.provider.elevenlabs.playground.fields.field.voice.description') }}
                  </div>
                </div>
                <select
                  v-model="selectedVoice"
                  border="neutral-300 dark:neutral-800 solid 2 focus:neutral-400 dark:focus:neutral-600"
                  transition="border duration-250 ease-in-out" w-full rounded-lg px-2 py-1 text-nowrap text-sm
                  outline-none
                >
                  <option v-for="voice in availableVoices" :key="voice.id" :value="voice.name">
                    {{ voice.name }}
                  </option>
                </select>
              </label>
            </div>
            <div flex="~ row" gap-4>
              <button
                border="neutral-800 dark:neutral-200 solid 2" transition="border duration-250 ease-in-out"
                rounded-lg px-4 text="neutral-100 dark:neutral-900" py-2 text-sm
                :disabled="isGenerating || !testText.trim() || !apiKey"
                :class="{ 'opacity-50 cursor-not-allowed': isGenerating || !testText.trim() || !apiKey }"
                bg="neutral-700 dark:neutral-300" @click="generateTestSpeech"
              >
                <div flex="~ row" items-center gap-2>
                  <div i-solar:play-circle-bold-duotone />
                  <span>{{ isGenerating ? t('settings.pages.providers.provider.elevenlabs.playground.buttons.button.test-voice.generating') : t('settings.pages.providers.provider.elevenlabs.playground.buttons.button.test-voice.label') }}</span>
                </div>
              </button>
              <button
                v-if="audioUrl" border="primary-300 dark:primary-800 solid 2"
                transition="border duration-250 ease-in-out" rounded-lg px-4 py-2 text-sm @click="stopTestAudio"
              >
                <div flex="~ row" items-center gap-2>
                  <div i-solar:stop-circle-bold-duotone />
                  <span>Stop</span>
                </div>
              </button>
            </div>
            <div v-if="!apiKey" class="mt-2 text-sm text-red-500">
              {{ t('settings.pages.providers.provider.elevenlabs.playground.validation.error-missing-api-key') }}
            </div>
            <div v-if="errorMessage" class="mt-2 text-sm text-red-500">
              {{ errorMessage }}
            </div>
            <audio v-if="audioUrl" ref="audioPlayer" :src="audioUrl" controls class="mt-2 w-full" />
          </div>
        </div>
      </div>
    </div>
  </ProviderSettingsLayout>
</template>
