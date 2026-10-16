<script setup lang="ts">
import {
  Alert,
  ErrorContainer,
  ProviderBasicSettings,
  ProviderSettingsContainer,
  ProviderSettingsLayout,
} from '@proj-airi/stage-ui/components'
import { useVoiceController } from '@proj-airi/stage-ui/composables/audio/voice-controller'
import { selectProviderMetadata } from '@proj-airi/stage-ui/libs'
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { Button, FieldCombobox } from '@proj-airi/ui'
import { computedAsync } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const providerId = 'browser-web-speech-api'
const { t } = useI18n()
const router = useRouter()

const providersStore = useProviderStore()

const providerStore = useProviderConfigStore()
const { configs: providers } = storeToRefs(providerStore)

onMounted(async () => {
  await providersStore.initializeProvider(providerId)
})

const providerMetadata = computedAsync(() => selectProviderMetadata(
  providersStore.getProviderDefinition(providerId),
  t,
  { id: providerId },
))

// Web Speech API settings (no API key needed, but language and options)
const settings = computed({
  get: () => providers.value[providerId] || {},
  set: (value) => {
    providers.value[providerId] = value
  },
})

const language = computed({
  get: () => typeof settings.value.language === 'string' ? settings.value.language : 'en-US',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].language = value
  },
})

const continuous = computed({
  get: () => typeof settings.value.continuous === 'boolean' ? settings.value.continuous : true,
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].continuous = value
  },
})

const interimResults = computed({
  get: () => typeof settings.value.interimResults === 'boolean' ? settings.value.interimResults : true,
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].interimResults = value
  },
})

// Common language options for Web Speech API
const languageOptions = [
  { label: 'English (US)', value: 'en-US' },
  { label: 'English (UK)', value: 'en-GB' },
  { label: 'Spanish', value: 'es-ES' },
  { label: 'French', value: 'fr-FR' },
  { label: 'German', value: 'de-DE' },
  { label: 'Italian', value: 'it-IT' },
  { label: 'Portuguese', value: 'pt-BR' },
  { label: 'Japanese', value: 'ja-JP' },
  { label: 'Korean', value: 'ko-KR' },
  { label: 'Chinese (Simplified)', value: 'zh-CN' },
  { label: 'Chinese (Traditional)', value: 'zh-TW' },
  { label: 'Russian', value: 'ru-RU' },
]

function ensureProviderSettings() {
  if (!providers.value[providerId]) {
    providers.value[providerId] = {
      language: 'en-US',
      continuous: true,
      interimResults: true,
    }
  }
}

function handleResetSettings() {
  providers.value[providerId] = {
    language: 'en-US',
    continuous: true,
    interimResults: true,
  }
}

// Check if Web Speech API is available
const isWebSpeechAPIAvailable = computed(() => {
  return typeof window !== 'undefined'
    && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)
})

const settingsAudioDeviceStore = useSettingsAudioDevice()
const { askPermission } = settingsAudioDeviceStore
const { audioInputOptions, selectedAudioInput } = storeToRefs(settingsAudioDeviceStore)

onMounted(async () => {
  ensureProviderSettings()
  await askPermission()
})

const hearing = useHearingStore()
const testTranscriptionText = ref('')
const { controller, state, snapshot, error: testTranscriptionError } = useVoiceController({
  transcriber: () => hearing.createTranscriber(providerId),
  submit: async (submission) => {
    testTranscriptionText.value = submission.text
    return { status: 'drafted', draftId: submission.submissionId }
  },
})
const isTestingSTT = computed(() => state.value?.phase === 'pending' || state.value?.phase === 'capturing')
const isTranscribing = computed(() => state.value?.phase === 'finalizing')
const testStreamingText = computed(() => isTestingSTT.value || isTranscribing.value ? snapshot.value?.transcript.text ?? '' : '')
const testStatusMessage = computed(() => {
  if (state.value?.phase === 'pending')
    return t('stage.chat.voice-message.starting')
  if (state.value?.phase === 'capturing')
    return t('stage.chat.voice-message.recording')
  if (state.value?.phase === 'finalizing')
    return t('stage.chat.voice-preview.processing')
  return ''
})

function startSTTTest() {
  testTranscriptionText.value = ''
  controller.beginInput({ sessionId: 'web-speech-preview', interruptTurns: [], start: { kind: 'after-silence' } })
}

function stopSTTTest() {
  void controller.activeInput?.end()
}
</script>

<template>
  <ProviderSettingsLayout
    :provider-name="providerMetadata?.localizedName || 'Web Speech API'"
    :provider-icon="providerMetadata?.icon"
    :provider-icon-color="providerMetadata?.iconColor"
    :on-back="() => router.back()"
  >
    <div flex="~ col md:row gap-6">
      <ProviderSettingsContainer class="w-full md:w-[40%] space-y-6">
        <Alert
          v-if="!isWebSpeechAPIAvailable"
          type="error"
        >
          <template #title>
            Web Speech API Not Available
          </template>
          <template #content>
            Web Speech API is not available in this browser. It requires Chrome, Edge, Safari, or other Chromium-based browsers. This provider cannot be used in your current environment.
          </template>
        </Alert>

        <Alert
          v-else
          type="info"
        >
          <template #title>
            Free, Browser-Native Transcription
          </template>
          <template #content>
            Web Speech API is a free, browser-native Speech-to-Text solution that requires no API keys or external services. It uses your browser's built-in speech recognition capabilities.
          </template>
        </Alert>

        <ProviderBasicSettings
          :title="t('settings.pages.providers.common.section.basic.title')"
          :description="t('settings.pages.providers.common.section.basic.description')"
          :on-reset="handleResetSettings"
        >
          <div class="space-y-4">
            <div class="border border-blue-200 rounded-lg bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
              <div class="flex items-center gap-2 text-blue-700 dark:text-blue-400">
                <div i-solar:info-circle-line-duotone class="text-sm" />
                <span class="text-xs font-medium">No API key required - Web Speech API is free and built into your browser</span>
              </div>
            </div>

            <FieldCombobox
              v-model="language"
              label="Recognition Language"
              description="Select the language for speech recognition"
              :options="languageOptions"
              layout="vertical"
            />

            <div class="space-y-2">
              <label class="flex items-center gap-2">
                <input
                  v-model="continuous"
                  type="checkbox"
                  class="border-neutral-300 rounded text-primary-600 dark:border-neutral-700 dark:bg-neutral-900 focus:ring-primary-500"
                >
                <span class="text-sm font-medium">Continuous Recognition</span>
              </label>
              <p class="text-xs text-neutral-500 dark:text-neutral-400">
                Keep listening continuously instead of stopping after each phrase
              </p>
            </div>

            <div class="space-y-2">
              <label class="flex items-center gap-2">
                <input
                  v-model="interimResults"
                  type="checkbox"
                  class="border-neutral-300 rounded text-primary-600 dark:border-neutral-700 dark:bg-neutral-900 focus:ring-primary-500"
                >
                <span class="text-sm font-medium">Show Interim Results</span>
              </label>
              <p class="text-xs text-neutral-500 dark:text-neutral-400">
                Display partial recognition results in real-time as you speak
              </p>
            </div>
          </div>
        </ProviderBasicSettings>
      </ProviderSettingsContainer>

      <!-- Speech-to-Text Test Section -->
      <div flex="~ col gap-6" class="w-full md:w-[60%]">
        <div w-full rounded-xl bg="neutral-50 dark:[rgba(0,0,0,0.3)]" p-4 flex="~ col gap-4">
          <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-400">
            Speech-to-Text Test
          </h2>
          <div text="sm neutral-400 dark:neutral-500" mb-2>
            Test Web Speech API transcription with your selected audio device. This test will always use Web Speech API regardless of your default hearing provider.
          </div>

          <div v-if="!isWebSpeechAPIAvailable" class="border border-amber-200 rounded-lg bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
            <div class="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <div i-solar:warning-circle-line-duotone class="text-lg" />
              <span class="text-sm font-medium">Web Speech API is not available in this browser</span>
            </div>
          </div>

          <div v-else class="flex flex-col gap-4">
            <!-- Audio Input Device Selector - Always visible when Web Speech API is available -->
            <div class="flex items-center gap-2">
              <FieldCombobox
                v-model="selectedAudioInput"
                label="Audio Input Device"
                description="Select the audio input device for testing"
                :options="audioInputOptions"
                placeholder="Select an audio input device"
                layout="vertical"
                class="flex-1"
              />
            </div>

            <!-- Warning if no device selected -->
            <div v-if="!selectedAudioInput" class="border border-amber-200 rounded-lg bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
              <div class="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <div i-solar:warning-circle-line-duotone class="text-lg" />
                <span class="text-sm font-medium">Please select an audio input device to test</span>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <Button
                :disabled="!selectedAudioInput || (isTranscribing && !isTestingSTT)"
                class="flex-1"
                @click="isTestingSTT ? stopSTTTest() : startSTTTest()"
              >
                <div v-if="isTranscribing" class="mr-2 animate-spin">
                  <div i-solar:spinner-line-duotone text-lg />
                </div>
                <div v-else-if="isTestingSTT" class="mr-2">
                  <div i-solar:stop-circle-line-duotone text-lg />
                </div>
                <div v-else class="mr-2">
                  <div i-solar:microphone-line-duotone text-lg />
                </div>
                {{ isTestingSTT ? 'Stop Test' : isTranscribing ? 'Transcribing...' : 'Start Speech-to-Text Test' }}
              </Button>
            </div>

            <ErrorContainer v-if="testTranscriptionError" title="Transcription Error" :error="testTranscriptionError" />

            <div v-if="testStatusMessage" class="border border-primary-200 rounded-lg bg-primary-50 p-3 dark:border-primary-800 dark:bg-primary-900/20">
              <div class="flex items-center gap-2 text-primary-700 dark:text-primary-400">
                <div v-if="isTranscribing" class="animate-spin text-sm" i-solar:spinner-line-duotone />
                <div v-else class="text-sm" i-solar:info-circle-line-duotone />
                <span class="text-sm font-medium">{{ testStatusMessage }}</span>
              </div>
            </div>

            <div class="border border-blue-200 rounded-lg bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
              <div class="flex items-center gap-2 text-blue-700 dark:text-blue-400">
                <div i-solar:info-circle-line-duotone class="text-sm" />
                <span class="text-xs">Streaming mode: Transcription will appear in real-time as you speak (Web Speech API)</span>
              </div>
            </div>

            <div class="space-y-3">
              <div>
                <label class="mb-1 block text-sm text-neutral-700 font-medium dark:text-neutral-300">
                  Transcription Result
                </label>
                <div
                  v-if="testTranscriptionText || testStreamingText"
                  class="min-h-[100px] border border-neutral-200 rounded-lg bg-white p-3 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                >
                  <div v-if="testStreamingText" class="text-neutral-600 dark:text-neutral-400">
                    <div class="mb-2 font-medium">
                      Current transcription (streaming):
                    </div>
                    <div class="whitespace-pre-wrap">
                      {{ testStreamingText }}
                    </div>
                  </div>
                  <div v-if="testTranscriptionText" class="text-neutral-700 dark:text-neutral-200">
                    <div v-if="testStreamingText" class="mb-2 mt-3 border-t border-neutral-200 pt-2 font-medium dark:border-neutral-700">
                      Final transcription:
                    </div>
                    <div class="whitespace-pre-wrap">
                      {{ testTranscriptionText }}
                    </div>
                  </div>
                </div>
                <div
                  v-else
                  class="min-h-[100px] border border-neutral-300 rounded-lg border-dashed bg-neutral-50 p-3 text-sm text-neutral-400 dark:border-neutral-700 dark:bg-neutral-900/50 dark:text-neutral-500"
                >
                  No transcription yet. Click "Start Speech-to-Text Test" and speak into your microphone.
                </div>
              </div>

              <div class="text-xs text-neutral-500 dark:text-neutral-400">
                <div>Provider: <span class="font-medium">Web Speech API</span></div>
                <div>Language: <span class="font-medium">{{ language }}</span></div>
                <div>Mode: <span class="font-medium">Streaming (real-time)</span></div>
                <div>Continuous: <span class="font-medium">{{ continuous ? 'Yes' : 'No' }}</span></div>
                <div>Interim Results: <span class="font-medium">{{ interimResults ? 'Yes' : 'No' }}</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </ProviderSettingsLayout>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
