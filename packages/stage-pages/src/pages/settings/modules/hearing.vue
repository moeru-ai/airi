<script setup lang="ts">
import workletUrl from '@proj-airi/stage-ui/workers/vad/process.worklet?worker&url'

import { Alert, Button, ErrorContainer, LevelMeter, RadioCardManySelect, RadioCardSimple, TestDummyMarker, ThresholdMeter, TimeSeriesChart } from '@proj-airi/stage-ui/components'
import { useAudioAnalyzer, useAudioRecorder } from '@proj-airi/stage-ui/composables'
import { useVAD } from '@proj-airi/stage-ui/stores/ai/models/vad'
import { useAudioContext } from '@proj-airi/stage-ui/stores/audio'
import {
  DEFAULT_TRANSCRIPTION_REGEX_ENABLED,
  DEFAULT_TRANSCRIPTION_REGEX_FLAGS,
  DEFAULT_TRANSCRIPTION_REGEX_PATTERN,
  DEFAULT_TRANSCRIPTION_REGEX_REPLACEMENT,
  useHearingSpeechInputPipeline,
  useHearingStore,
} from '@proj-airi/stage-ui/stores/modules/hearing'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { FieldCheckbox, FieldInput, FieldRange, FieldSelect } from '@proj-airi/ui'
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
  transcriptionRegexEnabled,
  transcriptionRegexPattern,
  transcriptionRegexReplacement,
  transcriptionRegexFlags,
  transcriptionRegexError,
} = storeToRefs(hearingStore)
const providersStore = useProvidersStore()
const { configuredTranscriptionProvidersMetadata } = storeToRefs(providersStore)

const { stopStream, startStream } = useSettingsAudioDevice()
const { audioInputs, selectedAudioInput, stream } = storeToRefs(useSettingsAudioDevice())
const { startRecord, stopRecord, onStopRecord } = useAudioRecorder(stream)
const { startAnalyzer, stopAnalyzer, onAnalyzerUpdate, volumeLevel } = useAudioAnalyzer()
const { audioContext } = storeToRefs(useAudioContext())
const { transcribeForRecording } = useHearingSpeechInputPipeline()

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

const manualHearingModel = computed({
  get: () => activeTranscriptionModel.value || activeCustomModelName.value,
  set: (value: string) => {
    activeTranscriptionModel.value = value
    activeCustomModelName.value = value
  },
})

const isTranscriptionRegexDefault = computed(() => {
  return transcriptionRegexEnabled.value === DEFAULT_TRANSCRIPTION_REGEX_ENABLED
    && (transcriptionRegexPattern.value ?? '') === DEFAULT_TRANSCRIPTION_REGEX_PATTERN
    && (transcriptionRegexReplacement.value ?? '') === DEFAULT_TRANSCRIPTION_REGEX_REPLACEMENT
    && (transcriptionRegexFlags.value ?? '') === DEFAULT_TRANSCRIPTION_REGEX_FLAGS
})

const useVADThreshold = ref(0.6) // 0.1 - 0.9
const speechPaddingMs = ref(80) // 0.08s - 1s pre-roll
const useVADModel = ref(true) // Toggle between VAD and volume-based detection
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
  threshold: useVADThreshold,
  speechPadMs: speechPaddingMs,
  onSpeechStart: () => startRecord(),
  onSpeechEnd: () => stopRecord(),
})

const isSpeechVolume = ref(false) // Volume-based speaking detection
const isSpeech = computed(() => {
  if (useVADModel.value && loadedVAD.value) {
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
      if (!useVADModel.value || !loadedVAD.value) {
        isSpeechVolume.value = volumeLevel > useVADThreshold.value
      }
    })
    if (analyzer)
      source.connect(analyzer)

    if (useVADModel.value) {
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
  if (!useVADModel.value || !loadedVAD.value) {
    // Volume-based: simple green/white
    return isSpeechVolume.value
      ? 'bg-green-500 shadow-lg shadow-green-500/50'
      : 'bg-white dark:bg-neutral-900 border-2 border-neutral-300 dark:border-neutral-600'
  }

  // VAD-based: color intensity based on probability
  const prob = isSpeechProb.value
  const threshold = useVADThreshold.value

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

function updateCustomModelName(value: string) {
  activeCustomModelName.value = value
}

onStopRecord(async (recording) => {
  if (!recording || recording.size <= 0)
    return

  const buffer = await recording.arrayBuffer()
  const fileType = recording.type || 'audio/wav'
  const file = new File([buffer], `recording-${Date.now()}.wav`, { type: fileType })

  audios.value.push(file)

  const res = await transcribeForRecording(file)

  if (res)
    transcriptions.value.push(res)
})

watch(selectedAudioInput, async () => isMonitoring.value && await setupAudioMonitoring())

onMounted(async () => {
  await hearingStore.loadModelsForProvider(activeTranscriptionProvider.value)
})

onUnmounted(() => {
  stopAudioMonitoring()
  disposeVAD()

  audioCleanups.value.forEach(cleanup => cleanup())
})
</script>

<template>
  <div flex="~ col md:row gap-6">
    <div bg="neutral-100 dark:[rgba(0,0,0,0.3)]" rounded-xl p-4 flex="~ col gap-4" class="h-fit w-full md:w-[40%]">
      <div flex="~ col gap-4">
        <!-- Audio Input Selection -->
        <div>
          <FieldSelect
            v-model="selectedAudioInput"
            label="Audio Input Device"
            description="Select the audio input device for your hearing module."
            :options="audioInputs.map(input => ({
              label: input.label || input.deviceId,
              value: input.deviceId,
            }))"
            placeholder="Select an audio input device"
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
                  <span class="font-medium">No Providers Configured</span>
                  <span class="text-sm text-neutral-400 dark:text-neutral-500">Click here to set up your Transcription providers</span>
                </div>
                <div i-solar:arrow-right-line-duotone class="ml-auto text-xl text-neutral-400 dark:text-neutral-500" />
              </RouterLink>
            </div>
          </div>
        </div>

        <!-- Model selection section -->
        <div v-if="activeTranscriptionProvider && supportsModelListing">
          <div flex="~ col gap-4">
            <div>
              <h2 class="text-lg md:text-2xl">
                {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.title') }}
              </h2>
              <div text="neutral-400 dark:neutral-400">
                <span>{{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.subtitle') }}</span>
              </div>
            </div>

            <!-- Loading state -->
            <div v-if="isLoadingActiveProviderModels" class="flex items-center justify-center py-4">
              <div class="mr-2 animate-spin">
                <div i-solar:spinner-line-duotone text-xl />
              </div>
              <span>{{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.loading') }}</span>
            </div>

            <!-- Warning when models cannot be fetched -->
            <Alert
              v-if="!isLoadingActiveProviderModels && activeProviderModelError"
              type="warning"
              icon="i-solar:warning-triangle-line-duotone"
            >
              <template #title>
                {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.error') }}
              </template>
              <template #content>
                {{ activeProviderModelError }}
              </template>
            </Alert>

            <!-- No models available -->
            <Alert
              v-if="providerModels.length === 0 && !isLoadingActiveProviderModels"
              type="warning"
            >
              <template #title>
                {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_models') }}
              </template>
              <template #content>
                {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_models_description') }}
              </template>
            </Alert>

            <template v-if="!isLoadingActiveProviderModels">
              <div
                v-if="providerModels.length === 0"
                class="space-y-2"
                border="~ dashed neutral-200 dark:neutral-800"
                rounded-xl
                p-4
              >
                <FieldInput
                  v-model="manualHearingModel"
                  label="Manual model ID"
                  description="Enter the model identifier exactly as the provider expects."
                  placeholder="e.g. whisper-1"
                />
                <p class="text-xs text-neutral-500 dark:text-neutral-400">
                  We'll remember this value even if the provider cannot list models.
                </p>
              </div>

              <!-- Using the new RadioCardManySelect component -->
              <template v-else>
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
                  @update:custom-value="updateCustomModelName"
                />
              </template>
            </template>
          </div>
        </div>

        <div v-else-if="activeTranscriptionProvider" class="space-y-4">
          <Alert type="info">
            <template #title>
              Provider does not list models automatically
            </template>
            <template #content>
              Enter the model ID manually so we can save your configuration.
            </template>
          </Alert>
          <FieldInput
            v-model="manualHearingModel"
            label="Model ID"
            description="Paste the transcription model name exactly as required by your provider."
            placeholder="e.g. whisper-1"
          />
        </div>
      </div>
    </div>

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

        <ErrorContainer v-if="error" title="Error occurred" :error="error" mb-4 />

        <Button class="mb-4" w-full @click="toggleMonitoring">
          {{ isMonitoring ? 'Stop Monitoring' : 'Start Monitoring' }}
        </Button>

        <div>
          <div v-for="(audio, index) in audioURLs" :key="index" class="mb-2">
            <audio :src="audio" controls class="w-full" />
            <div v-if="transcriptions[index]" class="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
              {{ transcriptions[index] }}
            </div>
          </div>
        </div>

        <div flex="~ col gap-4">
          <div class="space-y-4">
            <!-- Audio Level Visualization -->
            <div class="space-y-3">
              <!-- Volume Meter -->
              <LevelMeter :level="volumeLevel" label="Input Level" />

              <!-- VAD Probability Meter (when VAD model is active) -->
              <ThresholdMeter
                v-if="useVADModel && loadedVAD"
                :value="isSpeechProb"
                :threshold="useVADThreshold"
                label="Probability of Speech"
                below-label="Silence"
                above-label="Speech"
                threshold-label="Detection threshold"
              />

              <!-- Threshold Controls -->
              <div v-if="useVADModel && loadedVAD" class="space-y-3">
                <FieldRange
                  v-model="useVADThreshold"
                  label="Sensitivity"
                  description="Adjust the threshold for speech detection"
                  :min="0.1"
                  :max="0.9"
                  :step="0.05"
                  :format-value="value => `${(value * 100).toFixed(0)}%`"
                />
                <FieldRange
                  v-model="speechPaddingMs"
                  label="Speech Padding"
                  description="Buffer the audio so transcriptions include up to this many ms before the point VAD kicked in"
                  :min="80"
                  :max="1000"
                  :step="20"
                  :format-value="value => `${(value / 1000).toFixed(2)}s`"
                />
              </div>

              <div v-else class="space-y-3">
                <FieldRange
                  v-model="useVADThreshold"
                  label="Sensitivity"
                  description="Adjust the threshold for speech detection"
                  :min="1"
                  :max="80"
                  :step="1"
                  :format-value="value => `${value}%`"
                />
              </div>

              <!-- Speaking Indicator -->
              <div class="flex items-center gap-3">
                <div
                  class="h-4 w-4 rounded-full transition-all duration-200"
                  :class="speakingIndicatorClass"
                />
                <span class="text-sm font-medium">
                  {{ isSpeech ? 'Speaking Detected' : 'Silence' }}
                </span>
                <span class="ml-auto text-xs text-neutral-500">
                  {{ useVADModel && loadedVAD ? 'Model Based' : 'Volume Based' }}
                </span>
              </div>

              <!-- VAD Method Selection -->
              <div class="border-t border-neutral-200 pt-3 dark:border-neutral-700">
                <FieldCheckbox
                  v-model="useVADModel"
                  label="Model Based"
                  description="Use AI models for more accurate speech detection"
                />

                <!-- VAD Model Status -->
                <div v-if="useVADModel" class="mt-3 space-y-2">
                  <div v-if="loadingVAD" class="flex items-center gap-2 text-primary-600 dark:text-primary-400">
                    <div class="animate-spin text-sm" i-solar:spinner-line-duotone />
                    <span class="text-sm">Loading...</span>
                  </div>

                  <ErrorContainer
                    v-else-if="vadModelError"
                    title="Inference error"
                    :error="vadModelError"
                  />

                  <div v-else-if="loadedVAD" class="flex items-center gap-2 text-green-600 dark:text-green-400">
                    <div class="text-sm" i-solar:check-circle-bold-duotone />
                    <span class="text-sm">Activated</span>
                    <span class="ml-auto text-xs text-neutral-500">
                      Probability: {{ (isSpeechProb * 100).toFixed(1) }}%
                    </span>
                  </div>
                </div>
              </div>

              <!-- Voice Activity Visualization (when VAD model is active) -->
              <TimeSeriesChart
                v-if="useVADModel && loadedVAD"
                :history="isSpeechHistory"
                :current-value="isSpeechProb"
                :threshold="useVADThreshold"
                :is-active="isSpeech"
                title="Voice Activity"
                subtitle="Last 2 seconds"
                active-label="Speaking"
                active-legend-label="Voice detected"
                inactive-legend-label="Silence"
                threshold-label="Speech threshold"
              />
            </div>
          </div>
        </div>
      </div>

      <div
        class="space-y-4"
        border="~ dashed neutral-200 dark:neutral-800"
        rounded-xl
        p-4
      >
        <div>
          <h2 class="text-lg md:text-2xl">
            {{ t('settings.pages.modules.hearing.sections.section.regex.title') }}
          </h2>
          <div class="text-sm text-neutral-500 dark:text-neutral-400">
            {{ t('settings.pages.modules.hearing.sections.section.regex.description') }}
          </div>
        </div>

        <FieldCheckbox
          v-model="transcriptionRegexEnabled"
          :label="t('settings.pages.modules.hearing.sections.section.regex.enable.label')"
          :description="t('settings.pages.modules.hearing.sections.section.regex.enable.description')"
        />

        <div class="flex flex-wrap gap-2 md:flex-nowrap md:items-end">
          <FieldInput
            v-model="transcriptionRegexPattern"
            class="flex-1 min-w-0"
            :label="t('settings.pages.modules.hearing.sections.section.regex.pattern.label')"
            :description="t('settings.pages.modules.hearing.sections.section.regex.pattern.description')"
            :placeholder="t('settings.pages.modules.hearing.sections.section.regex.pattern.placeholder')"
            :disabled="!transcriptionRegexEnabled"
            spellcheck="false"
          />

          <Button
            class="shrink-0 whitespace-nowrap w-full md:w-auto"
            size="sm"
            variant="secondary-muted"
            icon="i-solar:refresh-bold-duotone"
            :disabled="isTranscriptionRegexDefault"
            :title="t('settings.pages.modules.hearing.sections.section.regex.reset.tooltip')"
            @click="hearingStore.resetTranscriptionRegex()"
          >
            {{ t('settings.pages.modules.hearing.sections.section.regex.reset.label') }}
          </Button>
        </div>

        <FieldInput
          v-model="transcriptionRegexReplacement"
          :label="t('settings.pages.modules.hearing.sections.section.regex.replacement.label')"
          :description="t('settings.pages.modules.hearing.sections.section.regex.replacement.description')"
          :placeholder="t('settings.pages.modules.hearing.sections.section.regex.replacement.placeholder')"
          :disabled="!transcriptionRegexEnabled"
        />

        <FieldInput
          v-model="transcriptionRegexFlags"
          :label="t('settings.pages.modules.hearing.sections.section.regex.flags.label')"
          :description="t('settings.pages.modules.hearing.sections.section.regex.flags.description')"
          placeholder="g"
          :disabled="!transcriptionRegexEnabled"
        />

        <p
          v-if="transcriptionRegexError"
          class="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
        >
          {{ t('settings.pages.modules.hearing.sections.section.regex.error_prefix') }} {{ transcriptionRegexError }}
        </p>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
