<script setup lang="ts">
import { LevelMeter, ThresholdMeter, TimeSeriesChart } from '@proj-airi/stage-ui/components'
import { FieldCheckbox, FieldRange, FieldSelect } from '@proj-airi/ui'
import { useDevicesList } from '@vueuse/core'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useAudioManager } from '../../../composables/audio/manager'

const devices = useDevicesList({ constraints: { audio: true } })
const audioInputs = computed(() => devices.audioInputs.value)

const i18n = useI18n()
// Initialize audio manager
const audioManager = useAudioManager(i18n.locale)

const selectedAudioInput = ref<string>('')
const selectedAudioInputSourceId = ref<string>('')

const enabledMonitoring = ref(false)
const enabledPlayback = ref(false)
const monitorVolume = ref(50)
const useVADModel = ref(true)

// Get current source data reactively
const currentSource = computed(() => {
  return selectedAudioInputSourceId.value ? audioManager.getSourceData(selectedAudioInputSourceId.value) : null
})

// Extract reactive values from the current source
const volumeLevel = computed(() => currentSource.value?.volume?.level.value ?? 0)
const vadProbability = computed(() => currentSource.value?.vad?.probability.value ?? 0)
const vadThreshold = computed({
  get: () => currentSource.value?.vad?.config.value.threshold ?? 0.5,
  set: (value) => {
    if (currentSource.value?.vad?.config.value.threshold) {
      currentSource.value.vad.config.value.threshold = value
    }
  },
})

const speakingThreshold = computed({
  get: () => currentSource.value?.volume?.threshold.value ?? 25,
  set: (value) => {
    if (currentSource.value?.volume?.threshold) {
      currentSource.value.volume.threshold.value = value
    }
  },
})

const isVADModelLoaded = computed(() => currentSource.value?.vad?.isModelLoaded.value ?? false)
const isLoadingVADModel = computed(() => currentSource.value?.vad?.isLoading.value ?? false)
const vadModelError = computed(() => currentSource.value?.vad?.error.value ?? '')
const vadHistory = computed(() => currentSource.value?.vad?.history.value ?? [])

// Speaking detection - prioritize VAD if enabled and loaded
const isSpeaking = computed(() => {
  if (useVADModel.value && isVADModelLoaded.value) {
    return currentSource.value?.vad?.isSpeaking.value ?? false
  }
  return currentSource.value?.volume?.isSpeaking.value ?? false
})

// Playback controls
const playbackEnabled = computed({
  get: () => currentSource.value?.playback?.isEnabled.value ?? false,
  set: (value) => {
    if (currentSource.value?.playback?.isEnabled) {
      currentSource.value.playback.isEnabled.value = value
    }
  },
})

const playbackVolume = computed({
  get: () => currentSource.value?.playback?.volume.value ?? 50,
  set: (value) => {
    if (currentSource.value?.playback?.volume) {
      currentSource.value.playback.volume.value = value
    }
  },
})

// Speaking indicator styling
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
    return 'bg-green-500 shadow-lg shadow-green-500/50'
  }
  else if (prob > threshold * 0.5) {
    return 'bg-yellow-500 shadow-lg shadow-yellow-500/30'
  }
  else {
    return 'bg-white dark:bg-neutral-900 border-2 border-neutral-300 dark:border-neutral-600'
  }
})

// Setup primary microphone source when device changes
watch(selectedAudioInput, async (newDeviceId) => {
  // Remove existing source
  if (selectedAudioInputSourceId.value) {
    await audioManager.stopSource(selectedAudioInputSourceId.value)
    audioManager.removeSource(selectedAudioInputSourceId.value)
    selectedAudioInputSourceId.value = ''
  }

  // Add new source if device selected
  if (newDeviceId) {
    const device = audioInputs.value.find(d => d.deviceId === newDeviceId)
    selectedAudioInputSourceId.value = audioManager.addMicrophone(
      newDeviceId,
      device?.label || 'Primary Microphone',
    )
  }
})

// Watch for VAD model toggle
watch([useVADModel, currentSource], ([enabled, source]) => {
  if (source?.vad?.isEnabled) {
    source.vad.isEnabled.value = enabled
  }
})

// Sync playback settings
watch(enabledPlayback, (enabled) => {
  playbackEnabled.value = enabled
})

watch(monitorVolume, (volume) => {
  playbackVolume.value = volume
})

// Monitoring toggle
async function toggleMonitoring() {
  if (!selectedAudioInputSourceId.value)
    return

  if (enabledMonitoring.value) {
    await audioManager.startSource(selectedAudioInputSourceId.value)
  }
  else {
    await audioManager.stopSource(selectedAudioInputSourceId.value)
  }
}

// Initialize with first available device
onMounted(async () => {
  await devices.ensurePermissions()
  await nextTick()

  if (audioInputs.value.length > 0 && !selectedAudioInput.value) {
    selectedAudioInput.value = audioInputs.value[0]?.deviceId
  }
})

// Cleanup on unmount
onUnmounted(async () => {
  if (selectedAudioInputSourceId.value) {
    await audioManager.stopSource(selectedAudioInputSourceId.value)
    audioManager.removeSource(selectedAudioInputSourceId.value)
  }
})
</script>

<template>
  <div class="space-y-6">
    <!-- Audio Input Selection -->
    <div>
      <FieldSelect
        v-model="selectedAudioInput" label="Audio Input Device"
        description="Select the audio input device for your hearing module." :options="audioInputs.map(input => ({
          label: input.label || input.deviceId,
          value: input.deviceId,
        }))" placeholder="Select an audio input device"
      />
    </div>

    <!-- Audio Monitoring Controls -->
    <div class="rounded-lg bg-neutral-50 p-4 dark:bg-neutral-800">
      <h3 class="mb-4 flex items-center gap-2 text-lg">
        <div class="text-xl" i-solar:volume-loud-bold-duotone />
        Monitoring
      </h3>

      <div class="space-y-4">
        <!-- Start/Stop Monitoring -->
        <FieldCheckbox
          v-model="enabledMonitoring" label="Enable Audio Monitoring"
          description="Start monitoring audio input levels and voice activity detection"
          @update:model-value="toggleMonitoring"
        />

        <!-- Audio Level Visualization -->
        <div v-if="enabledMonitoring && currentSource" class="space-y-3">
          <!-- Volume Meter -->
          <LevelMeter :level="volumeLevel" label="Input Level" />

          <!-- VAD Probability Meter (when VAD model is active) -->
          <ThresholdMeter
            v-if="useVADModel && isVADModelLoaded" :value="vadProbability" :threshold="vadThreshold"
            label="Probability of Speech" below-label="Silence" above-label="Speech"
            threshold-label="Detection threshold"
          />

          <!-- Threshold Controls -->
          <div v-if="useVADModel && isVADModelLoaded" class="space-y-3">
            <FieldRange
              v-model="vadThreshold" label="Sensitivity"
              description="Adjust the threshold for speech detection" :min="0.1" :max="0.9" :step="0.0001"
              :format-value="value => `${(value * 100).toFixed(0)}%`"
            />
          </div>

          <div v-else class="space-y-3">
            <FieldRange
              v-model="speakingThreshold" label="Sensitivity"
              description="Adjust the threshold for speech detection" :min="1" :max="80" :step="1"
              :format-value="value => `${value}%`"
            />
          </div>

          <!-- Speaking Indicator -->
          <div class="flex items-center gap-3">
            <div class="h-4 w-4 rounded-full transition-all duration-200" :class="speakingIndicatorClass" />
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
              v-model="useVADModel" label="Model Based"
              description="Use AI models for more accurate speech detection"
            />

            <!-- VAD Model Status -->
            <div v-if="useVADModel" class="mt-3 space-y-2">
              <div v-if="isLoadingVADModel" class="flex items-center gap-2 text-primary-600 dark:text-primary-400">
                <div class="animate-spin text-sm" i-solar:spinner-line-duotone />
                <span class="text-sm">Loading...</span>
              </div>

              <div
                v-else-if="vadModelError"
                class="flex items-center gap-2 whitespace-break-spaces break-anywhere text-red-600 dark:text-red-400"
              >
                <span class="text-sm">Inference error: {{ vadModelError }}</span>
              </div>

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
            v-if="useVADModel && isVADModelLoaded" :history="vadHistory" :current-value="vadProbability"
            :threshold="vadThreshold" :is-active="isSpeaking" title="Voice Activity" subtitle="Last 2 seconds"
            active-label="Speaking" active-legend-label="Voice detected" inactive-legend-label="Silence"
            threshold-label="Speech threshold"
          />
        </div>

        <!-- Audio Playback (Monitor) -->
        <div v-if="enabledMonitoring && currentSource" class="border-t border-neutral-200 pt-4 dark:border-neutral-700">
          <FieldCheckbox
            v-model="enabledPlayback" label="Monitor Audio (Listen)"
            description="Enable audio playback monitoring (like OBS). Be careful of feedback!"
          />

          <div v-if="enabledPlayback" class="mt-3">
            <FieldRange
              v-model="monitorVolume" label="Monitor Volume"
              description="Control the volume of audio monitoring playback" :min="0" :max="100" :step="5"
              :format-value="value => `${value}%`"
            />
          </div>
        </div>

        <!-- Warning for playback -->
        <div
          v-if="enabledPlayback"
          class="border border-amber-200 rounded-lg bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20"
        >
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
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
