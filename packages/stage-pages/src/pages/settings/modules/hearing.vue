<script setup lang="ts">
import workletUrl from '@proj-airi/stage-ui/workers/vad/process.worklet?worker&url'

import { Alert, ErrorContainer, LevelMeter, RadioCardManySelect, RadioCardSimple, TestDummyMarker, ThresholdMeter, TimeSeriesChart } from '@proj-airi/stage-ui/components'
import { useAnalytics, useAudioAnalyzer, useAudioRecorder } from '@proj-airi/stage-ui/composables'
import { useVAD } from '@proj-airi/stage-ui/stores/ai/models/vad'
import { useAudioContext } from '@proj-airi/stage-ui/stores/audio'
import { CONFIDENCE_THRESHOLD_DISABLED, useHearingSpeechInputPipeline, useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { Button, FieldCheckbox, FieldCombobox, FieldInput, FieldRange } from '@proj-airi/ui'
import { until } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const hearingStore = useHearingStore()
const {
  activeTranscriptionProvider,
  activeTranscriptionModel,
  providerModels,
  activeProviderModelError,
  isLoadingActiveProviderModels,
  supportsModelListing,
  transcriptionModelSearchQuery,
  activeCustomModelName,
  autoSendEnabled,
  autoSendDelay,
  confidenceThreshold,
  verboseJsonNotSupported,
  // 提取全局持久化配置
  useVADModel: globalUseVADModel,
  useVADThreshold: globalUseVADThreshold,
  volumeThreshold: globalVolumeThreshold,
  minSilenceDurationMs: globalMinSilenceDurationMs,
} = storeToRefs(hearingStore)
const providersStore = useProvidersStore()
const { configuredTranscriptionProvidersMetadata } = storeToRefs(providersStore)

const { trackProviderClick } = useAnalytics()
const { stopStream, startStream } = useSettingsAudioDevice()
const { audioInputs, selectedAudioInput, stream } = storeToRefs(useSettingsAudioDevice())
const { startRecord, stopRecord, onStopRecord } = useAudioRecorder(stream)
const { startAnalyzer, stopAnalyzer, onAnalyzerUpdate, volumeLevel } = useAudioAnalyzer()
const { audioContext } = storeToRefs(useAudioContext())
const hearingSpeechInputPipeline = useHearingSpeechInputPipeline()
const {
  transcribeForRecording,
  transcribeForMediaStream,
  stopStreamingTranscription,
} = hearingSpeechInputPipeline
const {
  supportsStreamInput,
  error: transcriptionPipelineError,
} = storeToRefs(hearingSpeechInputPipeline)

const animationFrame = ref<number>()

const error = ref<string>('')
const isMonitoring = ref(false)

const transcriptions = ref<string[]>([])
const audios = ref<Blob[]>([])
const audioCleanups = ref<(() => void)[]>([])
const audioURLs = computed(() => {
  return audios.value.map((blob) => {
    const url = URL.createObjectURL(blob)
    audioCleanups.value.push(() => URL.revokeObjectURL(url))
    return url
  })
})

// Speech-to-Text test state
const isTestingSTT = ref(false)
const testTranscriptionText = ref<string>('')
const testTranscriptionError = ref<string>('')
const isTranscribing = ref(false)
const testStreamingText = ref<string>('')
const testStatusMessage = ref<string>('')
const testStreamWasStarted = ref(false) // Track if we started the stream for testing

// 游乐场专属的临时测试变量
const testUseVADModel = ref(globalUseVADModel?.value ?? true)
const testUseVADThreshold = ref(globalUseVADThreshold?.value ?? 0.6)
const testVolumeThreshold = ref(globalVolumeThreshold?.value ?? 10)
const testMinSilenceDurationMs = ref(globalMinSilenceDurationMs?.value ?? 1200)

// 当你在左侧修改全局配置时，如果右侧没有正在监听测试，就自动同步过去
watch([globalUseVADModel, globalUseVADThreshold, globalVolumeThreshold, globalMinSilenceDurationMs], ([m, t, v, s]) => {
  if (!isMonitoring.value) {
    if (m !== undefined)
      testUseVADModel.value = m
    if (t !== undefined)
      testUseVADThreshold.value = t
    if (v !== undefined)
      testVolumeThreshold.value = v
    if (s !== undefined)
      testMinSilenceDurationMs.value = s
  }
})

const shouldUseStreamInput = computed(() => supportsStreamInput.value && !!stream.value)

async function handleSpeechStart() {
  if (shouldUseStreamInput.value && stream.value) {
    // Use both callbacks to support incremental updates and final transcript replacement.
    // ChatArea uses only onSentenceEnd to avoid re-adding deleted text.
    await transcribeForMediaStream(stream.value, {
      onSentenceEnd: (delta) => {
        transcriptions.value.push(delta)
      },
      onSpeechEnd: (text) => {
        transcriptions.value = [text]
      },
    })
    return
  }

  startRecord()
}

async function handleSpeechEnd() {
  if (shouldUseStreamInput.value) {
    // For streaming providers, keep the session alive; idle timer will handle teardown.
    return
  }

  stopRecord()
}

const {
  init: initVAD,
  dispose: disposeVAD,
  isSpeech: isSpeechVAD,
  isSpeechProb,
  isSpeechHistory,
  inferenceError: vadModelError,
  start: startVAD,
  loaded: loadedVAD,
  loading: loadingVAD,
} = useVAD(workletUrl, {
  threshold: testUseVADThreshold, // 使用测试变量
  minSilenceDurationMs: testMinSilenceDurationMs, // 使用测试变量
  onSpeechStart: () => {
    void handleSpeechStart()
  },
  onSpeechEnd: () => {
    void handleSpeechEnd()
  },
})

const isSpeechVolume = ref(false) // Volume-based speaking detection
const isSpeech = computed(() => {
  if (testUseVADModel.value && loadedVAD.value) {
    return isSpeechVAD.value
  }

  return isSpeechVolume.value
})

async function setupAudioMonitoring() {
  try {
    if (!selectedAudioInput.value) {
      console.warn('No audio input device selected')
      return
    }

    await stopAudioMonitoring()

    await startStream()
    if (!stream.value) {
      console.warn('No audio stream available')
      return
    }

    const source = audioContext.value.createMediaStreamSource(stream.value)

    // Fallback speaking detection (when VAD model is not used)
    const analyzer = startAnalyzer(audioContext.value)
    onAnalyzerUpdate((volumeLevel) => {
      if (!testUseVADModel.value || !loadedVAD.value) {
        isSpeechVolume.value = volumeLevel > testVolumeThreshold.value // 拆分：使用独立的测试音量变量
      }
    })
    if (analyzer)
      source.connect(analyzer)

    if (testUseVADModel.value) {
      await initVAD()
      await startVAD(stream.value)
    }
  }
  catch (error) {
    console.error('Error setting up audio monitoring:', error)
    vadModelError.value = error instanceof Error ? error.message : String(error)
  }
}

async function stopAudioMonitoring() {
  if (animationFrame.value) { // Stop animation frame
    cancelAnimationFrame(animationFrame.value)
    animationFrame.value = undefined
  }

  await stopStreamingTranscription(true, activeTranscriptionProvider.value)
  if (stream.value) { // Stop media stream
    stopStream()
  }

  stopAnalyzer()
  disposeVAD()
}

// Monitoring toggle
async function toggleMonitoring() {
  if (!isMonitoring.value) {
    await setupAudioMonitoring()
    isMonitoring.value = true
  }
  else {
    await stopAudioMonitoring()
    isMonitoring.value = false
  }
}

// Speaking indicator with enhanced VAD visualization
const speakingIndicatorClass = computed(() => {
  if (!testUseVADModel.value || !loadedVAD.value) { // 替换为 test 变量
    // Volume-based: simple green/white
    return isSpeechVolume.value
      ? 'bg-green-500 shadow-lg shadow-green-500/50'
      : 'bg-white dark:bg-neutral-900 border-2 border-neutral-300 dark:border-neutral-600'
  }

  // VAD-based: color intensity based on probability
  const prob = isSpeechProb.value
  const threshold = testUseVADThreshold.value // 替换为 test 变量

  if (prob > threshold) {
    // Speaking: green (could add intensity in future)
    return `bg-green-500 shadow-lg shadow-green-500/50`
  }
  else if (prob > threshold * 0.5) {
    // Close to threshold: yellow
    return 'bg-yellow-500 shadow-lg shadow-yellow-500/30'
  }
  else {
    // Low probability: neutral
    return 'bg-white dark:bg-neutral-900 border-2 border-neutral-300 dark:border-neutral-600'
  }
})

function updateCustomModelName(value: string | undefined) {
  const modelValue = value || ''
  activeCustomModelName.value = modelValue
  activeTranscriptionModel.value = modelValue
}

// Sync OpenAI Compatible model from provider config
function syncOpenAICompatibleSettings() {
  if (activeTranscriptionProvider.value !== 'openai-compatible-audio-transcription')
    return

  const providerConfig = providersStore.getProviderConfig(activeTranscriptionProvider.value)
  // Always sync model from provider config (override any existing value from previous provider)
  if (providerConfig?.model) {
    activeTranscriptionModel.value = providerConfig.model as string
    updateCustomModelName(providerConfig.model as string)
  }
  else {
    // If no model in provider config, use default
    const defaultModel = 'whisper-1'
    activeTranscriptionModel.value = defaultModel
    updateCustomModelName(defaultModel)
  }
}

onStopRecord(async (recording) => {
  if (shouldUseStreamInput.value)
    return

  if (!recording || recording.size === 0)
    return

  // Handle STT test transcription directly here
  if (isTestingSTT.value) {
    testStatusMessage.value = 'Transcribing recording...'
    isTranscribing.value = true

    try {
      const result = await transcribeForRecording(recording)
      if (result) {
        testTranscriptionText.value = result
        testStatusMessage.value = 'Transcription complete!'
        console.info('STT test transcription result:', result)
      }
      else {
        testTranscriptionError.value = transcriptionPipelineError.value || 'No transcription result returned from provider'
        testStatusMessage.value = 'Transcription failed'
      }
    }
    catch (err) {
      testTranscriptionError.value = err instanceof Error ? err.message : String(err)
      testStatusMessage.value = `Error: ${testTranscriptionError.value}`
      console.error('STT test transcription error:', err)
    }
    finally {
      isTranscribing.value = false
      isTestingSTT.value = false
    }
    return
  }

  // Normal monitoring mode - add to audios and transcribe
  audios.value.push(recording)

  const res = await transcribeForRecording(recording)

  if (res) {
    transcriptions.value.push(res)
    error.value = ''
  }
  else if (transcriptionPipelineError.value) {
    error.value = transcriptionPipelineError.value
  }
})

// Speech-to-Text test functions
async function startSTTTest() {
  if (!activeTranscriptionProvider.value) {
    testTranscriptionError.value = 'Please select a transcription provider first'
    return
  }

  if (!selectedAudioInput.value) {
    testTranscriptionError.value = 'Please select an audio input device first'
    return
  }

  testTranscriptionError.value = ''
  testTranscriptionText.value = ''
  testStreamingText.value = ''
  testStatusMessage.value = ''
  error.value = ''
  isTestingSTT.value = true
  isTranscribing.value = true

  try {
    // Ensure audio stream is available
    if (!stream.value) {
      testStatusMessage.value = 'Starting audio stream...'
      testStreamWasStarted.value = true
      await startStream()

      // Wait for the stream to become available with a 3-second timeout.
      try {
        await until(stream).toBeTruthy({ timeout: 3000, throwOnTimeout: true })
      }
      catch {
        handleStreamStartError()
        return
      }

      // Type guard: until guarantees stream.value is truthy, but TypeScript doesn't know this
      if (!stream.value) {
        handleStreamStartError()
        return
      }
    }
    else {
      testStreamWasStarted.value = false // Stream was already running
    }

    // Check if provider supports streaming input
    if (shouldUseStreamInput.value && stream.value) {
      testStatusMessage.value = 'Starting streaming transcription...'
      console.info('Starting STT test with streaming input for provider:', activeTranscriptionProvider.value)

      await transcribeForMediaStream(stream.value, {
        onSentenceEnd: (delta) => {
          if (delta && delta.trim()) {
            testStreamingText.value += `${delta} `
            testStatusMessage.value = 'Transcribing... (streaming)'
            isTranscribing.value = true
            console.info('STT test received sentence:', delta)
          }
        },
        onSpeechEnd: (text) => {
          if (text) {
            testTranscriptionText.value = text
            testStreamingText.value = ''
            testStatusMessage.value = 'Transcription complete!'
            isTranscribing.value = false
            console.info('STT test completed with text:', text)
          }
          else {
            testStatusMessage.value = 'Waiting for speech...'
            isTranscribing.value = false
          }
        },
      })

      testStatusMessage.value = 'Listening for speech... (streaming mode active)'
      isTranscribing.value = false // Not actively transcribing yet, just listening
    }
    else {
      // Fallback to recording-based transcription
      testStatusMessage.value = 'Recording audio for transcription... (3 seconds)'
      console.info('Starting STT test with recording-based transcription for provider:', activeTranscriptionProvider.value)

      startRecord()

      // Wait a bit for recording to start, then stop it after a delay
      setTimeout(async () => {
        stopRecord()
        testStatusMessage.value = 'Processing transcription...'
      }, 3000) // Record for 3 seconds
    }
  }
  catch (err) {
    testTranscriptionError.value = err instanceof Error ? err.message : String(err)
    testStatusMessage.value = `Error: ${testTranscriptionError.value}`
    isTranscribing.value = false
    isTestingSTT.value = false
    console.error('STT test error:', err)
  }
}

async function stopSTTTest() {
  isTestingSTT.value = false
  isTranscribing.value = false
  testStatusMessage.value = 'Stopped'

  try {
    // Stop streaming transcription if active
    if (shouldUseStreamInput.value) {
      await stopStreamingTranscription(false, activeTranscriptionProvider.value)
    }
    else {
      stopRecord()
    }
  }
  catch (err) {
    console.error('Error stopping STT test:', err)
  }

  // Finalize transcription if we have streaming text
  if (testStreamingText.value.trim() && !testTranscriptionText.value) {
    testTranscriptionText.value = testStreamingText.value.trim()
  }

  // Stop the stream if we started it for testing (and monitoring is not active)
  if (testStreamWasStarted.value && !isMonitoring.value) {
    try {
      stopStream()
      testStreamWasStarted.value = false
    }
    catch (err) {
      console.error('Error stopping test stream:', err)
    }
  }
}

// Note: STT test transcription is now handled directly in onStopRecord handler above
// This watch is kept for potential future use but is no longer needed for STT tests

watch(selectedAudioInput, async () => isMonitoring.value && await setupAudioMonitoring())

function handleStreamStartError() {
  testTranscriptionError.value = 'Failed to start audio stream. Please check microphone permissions.'
  testStatusMessage.value = 'Error: Failed to start audio stream'
  isTranscribing.value = false
  isTestingSTT.value = false
  testStreamWasStarted.value = false
}

watch(activeTranscriptionProvider, async (provider) => {
  if (!provider)
    return

  await hearingStore.loadModelsForProvider(provider)
  syncOpenAICompatibleSettings()

  // Auto-select first model for Web Speech API if no model is selected
  if (provider === 'browser-web-speech-api' && !activeTranscriptionModel.value) {
    const models = providerModels.value
    if (models.length > 0) {
      activeTranscriptionModel.value = models[0].id
      console.info('Auto-selected Web Speech API model:', models[0].id)
    }
  }
}, { immediate: true })

onMounted(async () => {
  // Audio devices are loaded on demand when user requests them
  syncOpenAICompatibleSettings()
})

onUnmounted(() => {
  stopSTTTest()
  stopAudioMonitoring()
  disposeVAD()

  // Clean up any active transcription sessions when leaving the page
  // This prevents stale sessions from interfering with other pages
  if (shouldUseStreamInput.value) {
    stopStreamingTranscription(true, activeTranscriptionProvider.value).catch((err) => {
      console.warn('[Hearing Module] Error cleaning up transcription session on unmount:', err)
    })
  }

  audioCleanups.value.forEach(cleanup => cleanup())
})
</script>

<template>
  <div flex="~ col md:row gap-6">
    <div bg="neutral-100 dark:[rgba(0,0,0,0.3)]" rounded-xl p-4 flex="~ col gap-4" class="h-fit w-full md:w-[40%]">
      <div flex="~ col gap-4">
        <!-- Audio Input Selection -->
        <div>
          <FieldCombobox
            v-model="selectedAudioInput"
            :label="t('settings.pages.modules.hearing.sections.section.audio-input.title')"
            :description="t('settings.pages.modules.hearing.sections.section.audio-input.description')"
            :options="audioInputs.map(input => ({
              label: input.label || input.deviceId,
              value: input.deviceId,
            }))"
            :placeholder="t('settings.pages.modules.hearing.sections.section.audio-input.placeholder')"
            layout="vertical"
          />
        </div>

        <div flex="~ col gap-4">
          <div>
            <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-500">
              {{ t('settings.pages.providers.title') }}
            </h2>
            <div text="neutral-400 dark:neutral-400">
              <span>{{ t('settings.pages.modules.hearing.sections.section.provider-selection.description') }}</span>
            </div>
          </div>
          <div max-w-full>
            <!--
            fieldset has min-width set to --webkit-min-container, in order to use over flow scroll,
            we need to set the min-width to 0.
            See also: https://stackoverflow.com/a/33737340
          -->
            <fieldset
              v-if="configuredTranscriptionProvidersMetadata.length > 0"
              flex="~ row gap-4"
              :style="{ 'scrollbar-width': 'none' }"
              min-w-0 of-x-scroll scroll-smooth
              role="radiogroup"
            >
              <RadioCardSimple
                v-for="metadata in configuredTranscriptionProvidersMetadata"
                :id="metadata.id"
                :key="metadata.id"
                v-model="activeTranscriptionProvider"
                name="provider"
                :value="metadata.id"
                :title="metadata.localizedName || 'Unknown'"
                :description="metadata.localizedDescription"
                @click="trackProviderClick(metadata.id, 'hearing')"
              />
              <RouterLink
                to="/settings/providers#transcription"
                border="2px solid"
                class="border-neutral-100 bg-white dark:border-neutral-900 hover:border-primary-500/30 dark:bg-neutral-900/20 dark:hover:border-primary-400/30"

                flex="~ col items-center justify-center"

                transition="all duration-200 ease-in-out"
                relative min-w-50 w-fit rounded-xl p-4
              >
                <div i-solar:add-circle-line-duotone class="text-2xl text-neutral-500 dark:text-neutral-500" />
                <div
                  class="bg-dotted-neutral-200/80 dark:bg-dotted-neutral-700/50"
                  absolute inset-0 z--1
                  style="background-size: 10px 10px; mask-image: linear-gradient(165deg, white 30%, transparent 50%);"
                />
              </RouterLink>
            </fieldset>
            <div v-else>
              <RouterLink
                class="flex items-center gap-3 rounded-lg p-4"
                border="2 dashed neutral-200 dark:neutral-800"
                bg="neutral-50 dark:neutral-800"
                transition="colors duration-200 ease-in-out"
                to="/settings/providers"
              >
                <div i-solar:warning-circle-line-duotone class="text-2xl text-amber-500 dark:text-amber-400" />
                <div class="flex flex-col">
                  <span class="font-medium">{{ t('settings.pages.modules.hearing.sections.section.no-providers.title') }}</span>
                  <span class="text-sm text-neutral-400 dark:text-neutral-500">{{ t('settings.pages.modules.hearing.sections.section.no-providers.description') }}</span>
                </div>
                <div i-solar:arrow-right-line-duotone class="ml-auto text-xl text-neutral-400 dark:text-neutral-500" />
              </RouterLink>
            </div>
          </div>
        </div>

        <!-- Model selection section -->
        <div v-if="activeTranscriptionProvider">
          <div flex="~ col gap-4">
            <div>
              <h2 class="text-lg md:text-2xl">
                {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.title') }}
              </h2>
              <div class="flex flex-col items-start gap-1 text-neutral-400 md:flex-row md:items-center md:justify-between dark:text-neutral-400">
                <span v-if="supportsModelListing && providerModels.length > 0">
                  {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.subtitle') }}
                </span>
                <span v-else>
                  {{ t('settings.pages.modules.hearing.sections.section.model-input-placeholder') }}
                </span>
                <span v-if="activeTranscriptionModel" class="text-sm text-neutral-400 font-medium dark:text-neutral-400">{{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.current_model_label') }} {{ activeTranscriptionModel }}</span>
              </div>
            </div>

            <!-- Loading state -->
            <div v-if="isLoadingActiveProviderModels && supportsModelListing" class="flex items-center justify-center py-4">
              <div class="mr-2 animate-spin">
                <div i-solar:spinner-line-duotone text-xl />
              </div>
              <span>{{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.loading') }}</span>
            </div>

            <!-- Error state -->
            <ErrorContainer
              v-else-if="activeProviderModelError && supportsModelListing"
              :title="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.error')"
              :error="activeProviderModelError"
            />

            <!-- Manual input for providers without model listing or when no models are available -->
            <div
              v-else-if="!supportsModelListing || (activeTranscriptionProvider === 'openai-compatible-audio-transcription' && providerModels.length === 0 && !isLoadingActiveProviderModels)"
              class="mt-2"
            >
              <FieldInput
                :model-value="activeTranscriptionModel || activeCustomModelName || ''"
                placeholder="whisper-1"
                @update:model-value="updateCustomModelName"
              />
            </div>

            <!-- No models available (for other providers with model listing but no models) -->
            <Alert
              v-else-if="providerModels.length === 0 && !isLoadingActiveProviderModels && supportsModelListing"
              type="warning"
            >
              <template #title>
                {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_models') }}
              </template>
              <template #content>
                {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_models_description') }}
              </template>
            </Alert>

            <!-- Using the new RadioCardManySelect component for providers with models -->
            <template v-else-if="providerModels.length > 0 && supportsModelListing">
              <RadioCardManySelect
                v-model="activeTranscriptionModel"
                v-model:search-query="transcriptionModelSearchQuery"
                :items="providerModels.sort((a, b) => a.id === activeTranscriptionModel ? -1 : b.id === activeTranscriptionModel ? 1 : 0)"
                :searchable="true"
                :search-placeholder="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.search_placeholder')"
                :search-no-results-title="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_search_results')"
                :search-no-results-description="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_search_results_description', { query: transcriptionModelSearchQuery })"
                :search-results-text="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.search_results', { count: '{count}', total: '{total}' })"
                :custom-input-placeholder="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.custom_model_placeholder')"
                :expand-button-text="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.expand')"
                :collapse-button-text="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.collapse')"
                expanded-class="mb-12"
                @update:custom-value="updateCustomModelName"
              />
            </template>
          </div>
        </div>

        <!-- Confidence threshold (only for non-streaming providers) -->
        <div v-if="!supportsStreamInput" class="border-t border-neutral-200 pt-4 dark:border-neutral-700">
          <div class="mb-4">
            <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-500">
              {{ t('settings.pages.modules.hearing.sections.section.confidence-threshold.title') }}
            </h2>
            <div text="neutral-400 dark:neutral-400">
              {{ t('settings.pages.modules.hearing.sections.section.confidence-threshold.description') }}
            </div>
          </div>
          <FieldRange
            v-model="confidenceThreshold"
            :min="CONFIDENCE_THRESHOLD_DISABLED"
            :max="0"
            :step="0.1"
            :format-value="value => value <= CONFIDENCE_THRESHOLD_DISABLED ? t('settings.pages.modules.hearing.sections.section.confidence-threshold.disabled') : value.toFixed(1)"
          />
          <div v-if="confidenceThreshold > CONFIDENCE_THRESHOLD_DISABLED" class="mt-2 text-xs text-neutral-400 dark:text-neutral-500">
            {{ t('settings.pages.modules.hearing.sections.section.confidence-threshold.verbose-json-note') }}
          </div>
          <div v-if="verboseJsonNotSupported" class="mt-2 flex items-center gap-1.5 text-xs text-amber-500 dark:text-amber-400">
            <div i-solar:warning-circle-line-duotone class="shrink-0" />
            {{ t('settings.pages.modules.hearing.sections.section.confidence-threshold.verbose-json-unsupported') }}
          </div>
        </div>

        <!-- Auto-send settings -->
        <div class="border-t border-neutral-200 pt-4 dark:border-neutral-700">
          <div class="mb-4">
            <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-500">
              {{ t('settings.pages.modules.hearing.sections.section.auto-send.title') }}
            </h2>
            <div text="neutral-400 dark:neutral-400">
              {{ t('settings.pages.modules.hearing.sections.section.auto-send.description') }}
            </div>
          </div>

          <div class="space-y-4">
            <FieldCheckbox
              v-model="autoSendEnabled"
              :label="t('settings.pages.modules.hearing.sections.section.auto-send.enable.label')"
              :description="t('settings.pages.modules.hearing.sections.section.auto-send.enable.description')"
            />

            <FieldRange
              v-if="autoSendEnabled"
              v-model="autoSendDelay"
              :label="t('settings.pages.modules.hearing.sections.section.auto-send.delay.label')"
              :description="t('settings.pages.modules.hearing.sections.section.auto-send.delay.description')"
              :min="0"
              :max="10000"
              :step="100"
              :format-value="value => value === 0 ? t('settings.pages.modules.hearing.sections.section.auto-send.delay.immediate') : `${(value / 1000).toFixed(1)}s`"
            />
          </div>
        </div>

        <div :class="['pt-4', 'border-t border-neutral-200 dark:border-neutral-700']">
          <div :class="['mb-4']">
            <h2 :class="['text-lg md:text-2xl', 'text-neutral-500 dark:text-neutral-500']">
              {{ t('settings.pages.modules.hearing.sections.section.vad.global.title') }}
            </h2>
            <div :class="['text-neutral-400 dark:text-neutral-400']">
              {{ t('settings.pages.modules.hearing.sections.section.vad.global.description') }}
            </div>
          </div>

          <div :class="['space-y-4']">
            <FieldCheckbox
              v-model="globalUseVADModel"
              :label="t('settings.pages.modules.hearing.sections.section.vad.model-based.label')"
              :description="t('settings.pages.modules.hearing.sections.section.vad.model-based.description')"
            />

            <template v-if="globalUseVADModel">
              <FieldRange
                v-model="globalUseVADThreshold"
                :label="t('settings.pages.modules.hearing.sections.section.vad.threshold.label')"
                :description="t('settings.pages.modules.hearing.sections.section.vad.threshold.description')"
                :min="0.1"
                :max="0.9"
                :step="0.05"
                :format-value="value => `${(value * 100).toFixed(0)}%`"
              />
              <FieldRange
                v-model="globalMinSilenceDurationMs"
                :label="t('settings.pages.modules.hearing.sections.section.vad.silence.label')"
                :description="t('settings.pages.modules.hearing.sections.section.vad.silence.description')"
                :min="500"
                :max="5000"
                :step="100"
                :format-value="value => value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${value}ms`"
              />
            </template>

            <template v-else>
              <FieldRange
                v-model="globalVolumeThreshold"
                :label="t('settings.pages.modules.hearing.sections.section.vad.volume.label')"
                :description="t('settings.pages.modules.hearing.sections.section.vad.volume.description')"
                :min="1"
                :max="80"
                :step="1"
                :format-value="value => `${value}%`"
              />
            </template>
          </div>
        </div>
      </div>
    </div>

    <div flex="~ col gap-6" class="w-full md:w-[60%]">
      <!-- Audio Monitoring Section -->
      <div w-full rounded-xl>
        <h2 class="mb-4 text-lg text-neutral-500 md:text-2xl dark:text-neutral-400" w-full>
          <div class="inline-flex items-center gap-4">
            <TestDummyMarker />
            <div>
              {{ t('settings.pages.providers.provider.elevenlabs.playground.title') }}
            </div>
          </div>
        </h2>

        <ErrorContainer v-if="error" :title="t('settings.pages.modules.hearing.sections.section.monitoring.error')" :error="error" mb-4 />

        <Button class="mb-4" w-full @click="toggleMonitoring">
          {{ isMonitoring ? t('settings.pages.modules.hearing.sections.section.monitoring.stop') : t('settings.pages.modules.hearing.sections.section.monitoring.start') }}
        </Button>

        <div>
          <div v-for="(transcription, index) in transcriptions" :key="index" class="mb-2">
            <audio v-if="audioURLs[index]" :src="audioURLs[index]" controls class="w-full" />
            <div v-if="transcription" class="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
              {{ transcription }}
            </div>
          </div>
        </div>

        <div flex="~ col gap-4">
          <div class="space-y-4">
            <!-- Audio Level Visualization -->
            <div class="space-y-3">
              <!-- Volume Meter -->
              <LevelMeter :level="volumeLevel" :label="t('settings.pages.modules.hearing.sections.section.monitoring.input-level')" />

              <!-- VAD Probability Meter (when VAD model is active) -->
              <ThresholdMeter
                v-if="testUseVADModel && loadedVAD"
                :value="isSpeechProb"
                :threshold="testUseVADThreshold"
                :label="t('settings.pages.modules.hearing.sections.section.vad.chart.probability-of-speech')"
                :below-label="t('settings.pages.modules.hearing.sections.section.vad.status.silence')"
                :above-label="t('settings.pages.modules.hearing.sections.section.vad.chart.speech')"
                :threshold-label="t('settings.pages.modules.hearing.sections.section.vad.chart.detection-threshold')"
              />

              <div v-if="testUseVADModel && loadedVAD" class="space-y-3">
                <FieldRange
                  v-model="testUseVADThreshold"
                  :label="t('settings.pages.modules.hearing.sections.section.vad.test.threshold.label')"
                  :description="t('settings.pages.modules.hearing.sections.section.vad.test.threshold.description')"
                  :min="0.1"
                  :max="0.9"
                  :step="0.05"
                  :format-value="value => `${(value * 100).toFixed(0)}%`"
                />
                <FieldRange
                  v-model="testMinSilenceDurationMs"
                  :label="t('settings.pages.modules.hearing.sections.section.vad.test.silence.label')"
                  :description="t('settings.pages.modules.hearing.sections.section.vad.test.silence.description')"
                  :min="500"
                  :max="5000"
                  :step="100"
                  :format-value="value => value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${value}ms`"
                />
              </div>

              <div v-else class="space-y-3">
                <FieldRange
                  v-model="testVolumeThreshold"
                  :label="t('settings.pages.modules.hearing.sections.section.vad.test.volume.label')"
                  :description="t('settings.pages.modules.hearing.sections.section.vad.test.volume.description')"
                  :min="1"
                  :max="80"
                  :step="1"
                  :format-value="value => `${value}%`"
                />
              </div>

              <div class="flex items-center gap-3">
                <div
                  class="h-4 w-4 rounded-full transition-all duration-200"
                  :class="speakingIndicatorClass"
                />
                <span class="text-sm font-medium">
                  {{ isSpeech ? t('settings.pages.modules.hearing.sections.section.vad.status.speaking-detected') : t('settings.pages.modules.hearing.sections.section.vad.status.silence') }}
                </span>
                <span class="ml-auto text-xs text-neutral-500">
                  {{ testUseVADModel && loadedVAD ? t('settings.pages.modules.hearing.sections.section.vad.status.model-based') : t('settings.pages.modules.hearing.sections.section.vad.status.volume-based') }}
                </span>
              </div>

              <div class="border-t border-neutral-200 pt-3 dark:border-neutral-700">
                <FieldCheckbox
                  v-model="testUseVADModel"
                  :label="t('settings.pages.modules.hearing.sections.section.vad.test.model-based.label')"
                  :description="t('settings.pages.modules.hearing.sections.section.vad.test.model-based.description')"
                />

                <div v-if="testUseVADModel" class="mt-3 space-y-2">
                  <div v-if="loadingVAD" class="flex items-center gap-2 text-primary-600 dark:text-primary-400">
                    <div class="animate-spin text-sm" i-solar:spinner-line-duotone />
                    <span class="text-sm">{{ t('settings.pages.modules.hearing.sections.section.vad.chart.loading') }}</span>
                  </div>

                  <ErrorContainer
                    v-else-if="vadModelError"
                    :title="t('settings.pages.modules.hearing.sections.section.vad.chart.inference-error')"
                    :error="vadModelError"
                  />

                  <div v-else-if="loadedVAD" class="flex items-center gap-2 text-green-600 dark:text-green-400">
                    <div class="text-sm" i-solar:check-circle-bold-duotone />
                    <span class="text-sm">{{ t('settings.pages.modules.hearing.sections.section.vad.chart.activated') }}</span>
                    <span class="ml-auto text-xs text-neutral-500">
                      {{ t('settings.pages.modules.hearing.sections.section.vad.chart.probability') }} {{ (isSpeechProb * 100).toFixed(1) }}%
                    </span>
                  </div>
                </div>
              </div>

              <TimeSeriesChart
                v-if="testUseVADModel && loadedVAD"
                :history="isSpeechHistory"
                :current-value="isSpeechProb"
                :threshold="testUseVADThreshold"
                :is-active="isSpeech"
                :title="t('settings.pages.modules.hearing.sections.section.vad.chart.voice-activity')"
                :subtitle="t('settings.pages.modules.hearing.sections.section.vad.chart.last-2-seconds')"
                :active-label="t('settings.pages.modules.hearing.sections.section.vad.chart.speaking')"
                :active-legend-label="t('settings.pages.modules.hearing.sections.section.vad.chart.voice-detected')"
                :inactive-legend-label="t('settings.pages.modules.hearing.sections.section.vad.status.silence')"
                :threshold-label="t('settings.pages.modules.hearing.sections.section.vad.chart.speech-threshold')"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Speech-to-Text Test Section -->
      <div w-full rounded-xl bg="neutral-50 dark:[rgba(0,0,0,0.3)]" p-4 flex="~ col gap-4">
        <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-400">
          {{ t('settings.pages.modules.hearing.sections.section.stt-test.title') }}
        </h2>
        <div text="sm neutral-400 dark:neutral-500" mb-2>
          {{ t('settings.pages.modules.hearing.sections.section.stt-test.description') }}
        </div>

        <div v-if="!activeTranscriptionProvider" class="border border-amber-200 rounded-lg bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
          <div class="flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <div i-solar:warning-circle-line-duotone class="text-lg" />
            <span class="text-sm font-medium">{{ t('settings.pages.modules.hearing.sections.section.stt-test.warning-no-provider') }}</span>
          </div>
        </div>

        <div v-else-if="!selectedAudioInput" class="border border-amber-200 rounded-lg bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
          <div class="flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <div i-solar:warning-circle-line-duotone class="text-lg" />
            <span class="text-sm font-medium">{{ t('settings.pages.modules.hearing.sections.section.stt-test.warning-no-audio') }}</span>
          </div>
        </div>

        <div v-else class="flex flex-col gap-4">
          <div class="flex items-center gap-2">
            <Button
              :disabled="isTranscribing && !isTestingSTT"
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
              {{ isTestingSTT ? t('settings.pages.modules.hearing.sections.section.stt-test.btn-stop') : isTranscribing ? t('settings.pages.modules.hearing.sections.section.stt-test.btn-transcribing') : t('settings.pages.modules.hearing.sections.section.stt-test.btn-start') }}
            </Button>
          </div>

          <ErrorContainer v-if="testTranscriptionError" :title="t('settings.pages.modules.hearing.sections.section.stt-test.error-title')" :error="testTranscriptionError" />

          <div v-if="testStatusMessage" class="border border-primary-200 rounded-lg bg-primary-50 p-3 dark:border-primary-800 dark:bg-primary-900/20">
            <div class="flex items-center gap-2 text-primary-700 dark:text-primary-400">
              <div v-if="isTranscribing" class="animate-spin text-sm" i-solar:spinner-line-duotone />
              <div v-else class="text-sm" i-solar:info-circle-line-duotone />
              <span class="text-sm font-medium">{{ testStatusMessage }}</span>
            </div>
          </div>

          <div v-if="shouldUseStreamInput" class="border border-blue-200 rounded-lg bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
            <div class="flex items-center gap-2 text-blue-700 dark:text-blue-400">
              <div i-solar:info-circle-line-duotone class="text-sm" />
              <span class="text-xs">{{ t('settings.pages.modules.hearing.sections.section.stt-test.streaming-note') }}</span>
            </div>
          </div>

          <div class="space-y-3">
            <div>
              <label class="mb-1 block text-sm text-neutral-700 font-medium dark:text-neutral-300">
                {{ t('settings.pages.modules.hearing.sections.section.stt-test.result-title') }}
              </label>
              <div
                v-if="testTranscriptionText || testStreamingText"
                class="min-h-[100px] border border-neutral-200 rounded-lg bg-white p-3 text-sm dark:border-neutral-700 dark:bg-neutral-900"
              >
                <div v-if="testStreamingText && shouldUseStreamInput" class="text-neutral-600 dark:text-neutral-400">
                  <div class="mb-2 font-medium">
                    {{ t('settings.pages.modules.hearing.sections.section.stt-test.current-streaming') }}
                  </div>
                  <div class="whitespace-pre-wrap">
                    {{ testStreamingText }}
                  </div>
                </div>
                <div v-if="testTranscriptionText" class="text-neutral-700 dark:text-neutral-200">
                  <div v-if="testStreamingText && shouldUseStreamInput" class="mb-2 mt-3 border-t border-neutral-200 pt-2 font-medium dark:border-neutral-700">
                    {{ t('settings.pages.modules.hearing.sections.section.stt-test.final') }}
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
                {{ t('settings.pages.modules.hearing.sections.section.stt-test.no-result') }}
              </div>
            </div>

            <div v-if="activeTranscriptionProvider" class="text-xs text-neutral-500 dark:text-neutral-400">
              <div>{{ t('settings.pages.modules.hearing.sections.section.stt-test.info-provider') }} <span class="font-medium">{{ configuredTranscriptionProvidersMetadata.find(p => p.id === activeTranscriptionProvider)?.localizedName || activeTranscriptionProvider }}</span></div>
              <div v-if="activeTranscriptionModel">
                {{ t('settings.pages.modules.hearing.sections.section.stt-test.info-model') }} <span class="font-medium">{{ activeTranscriptionModel }}</span>
              </div>
              <div>{{ t('settings.pages.modules.hearing.sections.section.stt-test.info-mode') }} <span class="font-medium">{{ shouldUseStreamInput ? t('settings.pages.modules.hearing.sections.section.stt-test.mode-streaming') : t('settings.pages.modules.hearing.sections.section.stt-test.mode-recording') }}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.hearing.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
