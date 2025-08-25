<script setup lang="ts">
import type { TranscriptionProvider } from '@xsai-ext/shared-providers'

import { Alert, Button, ErrorContainer, LevelMeter, RadioCardManySelect, RadioCardSimple, TestDummyMarker, ThresholdMeter, TimeSeriesChart } from '@proj-airi/stage-ui/components'
import { useAudioAnalyzer, useAudioRecorder } from '@proj-airi/stage-ui/composables'
import { useAudioContext } from '@proj-airi/stage-ui/stores/audio'
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { FieldCheckbox, FieldRange, FieldSelect } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import workletUrl from '../../../workers/vad/process.worklet?worker&url'

import { createVAD, createVADStates } from '../../../workers/vad'

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
} = storeToRefs(hearingStore)
const providersStore = useProvidersStore()
const { configuredTranscriptionProvidersMetadata } = storeToRefs(providersStore)

const { stopStream, startStream } = useSettingsAudioDevice()
const { audioInputs, selectedAudioInput, stream } = storeToRefs(useSettingsAudioDevice())
const { startRecord, stopRecord, onStopRecord } = useAudioRecorder(stream)
const { startAnalyzer, stopAnalyzer, onAnalyzerUpdate, volumeLevel } = useAudioAnalyzer()
const { audioContext } = storeToRefs(useAudioContext())

const error = ref<string>('')
const vadModelError = ref('')

const isMonitoring = ref(false)
const enablePlayback = ref(false)

// Audio processing state
const gainNode = ref<GainNode>()
const animationFrame = ref<number>()

// Audio levels and indicators
const isSpeaking = ref(false)
const speakingThreshold = ref(25) // 0-100 (for volume-based fallback)
const monitorVolume = ref(50) // 0-100

// VAD integration
const vadManager = ref<ReturnType<typeof createVADStates>>()
const isVADModelLoaded = ref(false)
const isLoadingVADModel = ref(false)
const useVADModel = ref(true) // Toggle between VAD and volume-based detection
const vadProbability = ref(0) // Raw VAD probability
const vadThreshold = ref(0.5) // VAD probability threshold for speech detection

// VAD visualization
const vadHistory = ref<number[]>([]) // History for chart visualization
const maxVadHistory = 50 // Keep 50 samples (~1.6 seconds at 32ms intervals)

const audios = ref<Blob[]>([])
const audioCleanups = ref<(() => void)[]>([])
const audioURLs = computed(() => {
  return audios.value.map((blob) => {
    const url = URL.createObjectURL(blob)
    audioCleanups.value.push(() => URL.revokeObjectURL(url))
    return url
  })
})
const transcriptions = ref<string[]>([])

// VAD functions
async function loadVADModel() {
  if (isVADModelLoaded.value || isLoadingVADModel.value)
    return

  isLoadingVADModel.value = true
  vadModelError.value = ''

  try {
    // Create and initialize the VAD
    const vad = await createVAD({
      sampleRate: 16000,
      speechThreshold: vadThreshold.value,
      exitThreshold: vadThreshold.value * 0.3,
      minSilenceDurationMs: 400,
    })

    // Set up event handlers
    vad.on('speech-start', () => {
      isSpeaking.value = true
      startRecord() // Start recording when speech is detected
    })

    vad.on('speech-end', () => {
      isSpeaking.value = false
      stopRecord() // Stop recording when speech ends
    })

    vad.on('debug', ({ data }) => {
      if (data?.probability !== undefined) {
        vadProbability.value = data.probability

        // Update VAD history for visualization
        vadHistory.value.push(data.probability)
        if (vadHistory.value.length > maxVadHistory) {
          vadHistory.value.shift()
        }
      }
    })

    vad.on('status', ({ type, message }) => {
      if (type === 'error') {
        vadModelError.value = message
      }
    })

    // Create and initialize audio manager
    const manager = createVADStates(vad, workletUrl, {
      minChunkSize: 512,
      // NOTICE: VAD will have it's own audio context since
      // it needs special sample rate and latency settings
      audioContextOptions: {
        sampleRate: 16000,
        latencyHint: 'interactive',
      },
    })

    await manager.initialize()
    vadManager.value = manager
    isVADModelLoaded.value = true
  }
  catch (error) {
    vadModelError.value = error instanceof Error ? error.message : String(error)
    console.error('Failed to load VAD model:', error)
  }
  finally {
    isLoadingVADModel.value = false
  }
}

// Audio monitoring
async function setupAudioMonitoring() {
  try {
    if (!selectedAudioInput.value) {
      console.warn('No audio input device selected')
      return
    }

    // Clean up existing connections
    await stopAudioMonitoring()

    await startStream()
    if (!stream.value) {
      console.warn('No audio stream available')
      return
    }

    onStopRecord(async (recording) => {
      if (!recording)
        return

      try {
        if (recording && recording.size > 0) {
          audios.value.push(recording)

          const provider = await providersStore.getProviderInstance<TranscriptionProvider<string>>(activeTranscriptionProvider.value)
          if (!provider) {
            throw new Error('Failed to initialize speech provider')
          }

          // Get model from configuration or use default
          const model = activeTranscriptionModel.value
          const res = await hearingStore.transcription(provider, model, new File([recording], 'recording.wav'))

          transcriptions.value.push(res.text)
        }
      }
      catch (err) {
        error.value = err instanceof Error ? err.message : String(err)
        console.error('Error generating transcription:', error.value)
      }
    })

    const source = audioContext.value.createMediaStreamSource(stream.value)
    const analyzer = startAnalyzer(audioContext.value)

    onAnalyzerUpdate((volumeLevel) => {
      // Fallback speaking detection (when VAD model is not used)
      if (!useVADModel.value || !isVADModelLoaded.value) {
        isSpeaking.value = volumeLevel > speakingThreshold.value
      }
    })

    // Create gain node for playback volume control
    gainNode.value = audioContext.value.createGain()
    gainNode.value.gain.value = enablePlayback.value ? (monitorVolume.value / 100) : 0

    // Connect audio graph
    if (analyzer)
      source.connect(analyzer)

    if (enablePlayback.value) {
      source.connect(gainNode.value)
      gainNode.value.connect(audioContext.value.destination)
    }

    // Load VAD model and start VAD processing if enabled
    if (useVADModel.value) {
      await loadVADModel()
      if (vadManager.value) {
        await vadManager.value.start(stream.value)
      }
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
  if (vadManager.value) { // Stop VAD manager
    await vadManager.value.stop()
  }
  if (stream.value) { // Stop media stream
    stopStream()
  }

  stopAnalyzer()

  gainNode.value = undefined
  isSpeaking.value = false
  vadProbability.value = 0
  vadHistory.value = []
}

// Update playback routing when playback setting changes
async function updatePlayback() {
  if (!audioContext.value || !gainNode.value)
    return

  if (enablePlayback.value) {
    gainNode.value.gain.value = monitorVolume.value / 100
    gainNode.value.connect(audioContext.value.destination)
  }
  else {
    gainNode.value.gain.value = 0
    gainNode.value.disconnect()
  }
}

// Watchers
watch(selectedAudioInput, async () => {
  if (isMonitoring.value) {
    await setupAudioMonitoring()
  }
})

watch(enablePlayback, updatePlayback)
watch(monitorVolume, () => {
  if (gainNode.value && enablePlayback.value) {
    gainNode.value.gain.value = monitorVolume.value / 100
  }
})

watch(vadThreshold, () => {
  // Update VAD threshold if model is loaded
  if (vadManager.value && isVADModelLoaded.value) {
    // TODO: We would need to add an updateConfig method to VADAudioManager
  }
})

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
  if (!useVADModel.value || !isVADModelLoaded.value) {
    // Volume-based: simple green/white
    return isSpeaking.value
      ? 'bg-green-500 shadow-lg shadow-green-500/50'
      : 'bg-white dark:bg-neutral-900 border-2 border-neutral-300 dark:border-neutral-600'
  }

  // VAD-based: color intensity based on probability
  const prob = vadProbability.value
  const threshold = vadThreshold.value

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

onMounted(async () => {
  await hearingStore.loadModelsForProvider(activeTranscriptionProvider.value)
})

onUnmounted(() => {
  stopAudioMonitoring()
  if (vadManager.value) {
    vadManager.value.dispose()
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
              <span>{{ t('settings.pages.modules.hearing.sections.section.provider-model-selection.description') }}</span>
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

            <!-- Error state -->
            <ErrorContainer
              v-else-if="activeProviderModelError"
              :title="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.error')"
              :error="activeProviderModelError"
            />

            <!-- No models available -->
            <Alert
              v-else-if="providerModels.length === 0 && !isLoadingActiveProviderModels"
              type="warning"
            >
              <template #title>
                {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_models') }}
              </template>
              <template #content>
                {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_models_description') }}
              </template>
            </Alert>

            <!-- Using the new RadioCardManySelect component -->
            <template v-else-if="providerModels.length > 0">
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
          </div>
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
                v-if="useVADModel && isVADModelLoaded"
                :value="vadProbability"
                :threshold="vadThreshold"
                label="Probability of Speech"
                below-label="Silence"
                above-label="Speech"
                threshold-label="Detection threshold"
              />

              <!-- Threshold Controls -->
              <div v-if="useVADModel && isVADModelLoaded" class="space-y-3">
                <FieldRange
                  v-model="vadThreshold"
                  label="Sensitivity"
                  description="Adjust the threshold for speech detection"
                  :min="0.1"
                  :max="0.9"
                  :step="0.05"
                  :format-value="value => `${(value * 100).toFixed(0)}%`"
                />
              </div>

              <div v-else class="space-y-3">
                <FieldRange
                  v-model="speakingThreshold"
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
                  {{ isSpeaking ? 'Speaking Detected' : 'Silence' }}
                </span>
                <span class="ml-auto text-xs text-neutral-500">
                  {{ useVADModel && isVADModelLoaded ? 'Model Based' : 'Volume Based' }}
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
                  <div v-if="isLoadingVADModel" class="flex items-center gap-2 text-primary-600 dark:text-primary-400">
                    <div class="animate-spin text-sm" i-solar:spinner-line-duotone />
                    <span class="text-sm">Loading...</span>
                  </div>

                  <ErrorContainer
                    v-else-if="vadModelError"
                    title="Inference error"
                    :error="vadModelError"
                  />

                  <div v-else-if="isVADModelLoaded" class="flex items-center gap-2 text-green-600 dark:text-green-400">
                    <div class="text-sm" i-solar:check-circle-bold-duotone />
                    <span class="text-sm">Activated</span>
                    <span class="ml-auto text-xs text-neutral-500">
                      Probability: {{ (vadProbability * 100).toFixed(1) }}%
                    </span>
                  </div>
                </div>
              </div>

              <!-- Voice Activity Visualization (when VAD model is active) -->
              <TimeSeriesChart
                v-if="useVADModel && isVADModelLoaded"
                :history="vadHistory"
                :current-value="vadProbability"
                :threshold="vadThreshold"
                :is-active="isSpeaking"
                title="Voice Activity"
                subtitle="Last 2 seconds"
                active-label="Speaking"
                active-legend-label="Voice detected"
                inactive-legend-label="Silence"
                threshold-label="Speech threshold"
              />
            </div>

            <!-- Audio Playback (Monitor) -->
            <div v-if="isMonitoring" class="border-t border-neutral-200 pt-4 dark:border-neutral-700">
              <FieldCheckbox
                v-model="enablePlayback"
                label="Monitor Audio (Listen)"
                description="Enable audio playback monitoring (like OBS). Be careful of feedback!"
              />

              <div v-if="enablePlayback" class="mt-3">
                <FieldRange
                  v-model="monitorVolume"
                  label="Monitor Volume"
                  description="Control the volume of audio monitoring playback"
                  :min="0"
                  :max="100"
                  :step="5"
                  :format-value="value => `${value}%`"
                />
              </div>
            </div>

            <!-- Warning for playback -->
            <div v-if="enablePlayback" class="border border-amber-200 rounded-lg bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
              <div class="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                <div class="text-sm" i-solar:warning-circle-bold-duotone />
                <span class="text-sm font-medium">Audio feedback warning</span>
              </div>
              <div class="mt-1 text-xs text-amber-600 dark:text-amber-400">
                Use headphones to prevent audio feedback. Lower the monitor volume if you hear echoing.
              </div>
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
  stageTransition:
    name: slide
</route>
