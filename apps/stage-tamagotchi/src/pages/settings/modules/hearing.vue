<script setup lang="ts">
import { LevelMeter, ThresholdMeter, TimeSeriesChart } from '@proj-airi/stage-ui/components'
import { FieldCheckbox, FieldRange, FieldSelect } from '@proj-airi/ui'
import { useDevicesList } from '@vueuse/core'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

import { useTauriCore } from '../../../composables/tauri'

const devices = useDevicesList({ constraints: { audio: true } })
const audioInputs = computed(() => devices.audioInputs.value)
const { invoke } = useTauriCore()

const selectedAudioInput = ref<string>(devices.audioInputs.value[0]?.deviceId || '')

const isMonitoring = ref(false)
const enablePlayback = ref(false)

// Audio processing state
const audioContext = ref<AudioContext>()
const mediaStream = ref<MediaStream>()
const analyser = ref<AnalyserNode>()
const gainNode = ref<GainNode>()
const dataArray = ref<Uint8Array>()
const animationFrame = ref<number>()

// Audio levels and indicators
const volumeLevel = ref(0) // 0-100
const isSpeaking = ref(false)
const speakingThreshold = ref(25) // 0-100 (for volume-based fallback)
const monitorVolume = ref(50) // 0-100

// Tauri VAD integration
const isVADModelLoaded = ref(false)
const isLoadingVADModel = ref(false)
const vadModelError = ref('')
const useVADModel = ref(true) // Toggle between Tauri VAD and volume-based detection
const vadProbability = ref(0) // Raw VAD probability from Tauri
const vadThreshold = ref(0.5) // VAD probability threshold for speech detection

// Audio chunk buffering for Tauri VAD
const audioChunkBuffer = ref<Float32Array | null>(null)
const chunkSize = 512 // 32ms at 16kHz
const vadProcessingInterval = ref<number | null>(null)

// VAD visualization
const vadHistory = ref<number[]>([]) // History for chart visualization
const maxVadHistory = 50 // Keep 50 samples (~1.6 seconds at 32ms intervals)

// Tauri VAD functions
async function loadVADModel() {
  if (isVADModelLoaded.value || isLoadingVADModel.value)
    return

  isLoadingVADModel.value = true
  vadModelError.value = ''

  try {
    await invoke('plugin:proj-airi-tauri-plugin-audio-vad|load_model_silero_vad')
    isVADModelLoaded.value = true
  }
  catch (error) {
    vadModelError.value = error as string
    console.error('Failed to load VAD model:', error)
  }
  finally {
    isLoadingVADModel.value = false
  }
}

async function processAudioChunkWithVAD(audioData: Float32Array) {
  if (!isVADModelLoaded.value)
    return

  try {
    // Convert Float32Array to regular array for Tauri
    const chunk = Array.from(audioData)
    const probability = await invoke('plugin:proj-airi-tauri-plugin-audio-vad|audio_vad', { chunk })
    if (probability != null) {
      vadProbability.value = probability

      // Update VAD history for visualization
      vadHistory.value.push(probability)
      if (vadHistory.value.length > maxVadHistory) {
        vadHistory.value.shift()
      }
    }

    // Update speaking detection based on VAD
    if (useVADModel.value) {
      isSpeaking.value = vadProbability.value > vadThreshold.value
    }
  }
  catch (error) {
    console.error('VAD processing error:', error)
    // Fall back to volume-based detection
    if (!useVADModel.value) {
      isSpeaking.value = volumeLevel.value > speakingThreshold.value
    }
  }
}

function startVADProcessing() {
  if (vadProcessingInterval.value)
    return

  vadProcessingInterval.value = window.setInterval(async () => {
    if (audioChunkBuffer.value && audioChunkBuffer.value.length >= chunkSize) {
      // Process the chunk with Tauri VAD
      const chunk = audioChunkBuffer.value.slice(0, chunkSize)
      await processAudioChunkWithVAD(chunk)

      // Remove processed samples from buffer
      const remaining = audioChunkBuffer.value.slice(chunkSize)
      audioChunkBuffer.value = remaining.length > 0 ? remaining : new Float32Array(0)
    }
  }, 32) // 32ms intervals (chunkSize / sampleRate * 1000)
}

function stopVADProcessing() {
  if (vadProcessingInterval.value) {
    clearInterval(vadProcessingInterval.value)
    vadProcessingInterval.value = null
  }
  audioChunkBuffer.value = null
  vadProbability.value = 0
  vadHistory.value = []
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

    // Get user media with selected device
    mediaStream.value = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: selectedAudioInput.value,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })

    // Create audio context
    audioContext.value = new AudioContext()
    const source = audioContext.value.createMediaStreamSource(mediaStream.value)

    // Create analyser for volume detection
    analyser.value = audioContext.value.createAnalyser()
    analyser.value.fftSize = 256
    analyser.value.smoothingTimeConstant = 0.3

    // Create gain node for playback volume control
    gainNode.value = audioContext.value.createGain()
    gainNode.value.gain.value = enablePlayback.value ? (monitorVolume.value / 100) : 0

    // Connect audio graph
    source.connect(analyser.value)

    if (enablePlayback.value) {
      source.connect(gainNode.value)
      gainNode.value.connect(audioContext.value.destination)
    }

    // Set up data array for analysis
    const bufferLength = analyser.value.frequencyBinCount
    dataArray.value = new Uint8Array(bufferLength)

    // Start audio analysis loop
    startAudioAnalysis()

    // Load VAD model and start VAD processing if enabled
    if (useVADModel.value) {
      await loadVADModel()
      startVADProcessing()
      audioChunkBuffer.value = new Float32Array(0)
    }
  }
  catch (error) {
    console.error('Error setting up audio monitoring:', error)
  }
}

async function stopAudioMonitoring() {
  // Stop animation frame
  if (animationFrame.value) {
    cancelAnimationFrame(animationFrame.value)
    animationFrame.value = undefined
  }

  // Stop media stream
  if (mediaStream.value) {
    mediaStream.value.getTracks().forEach(track => track.stop())
    mediaStream.value = undefined
  }

  // Close audio context
  if (audioContext.value) {
    await audioContext.value.close()
    audioContext.value = undefined
  }

  analyser.value = undefined
  gainNode.value = undefined
  dataArray.value = undefined
  volumeLevel.value = 0
  isSpeaking.value = false

  // Stop VAD processing
  stopVADProcessing()
}

function startAudioAnalysis() {
  const analyze = () => {
    if (!analyser.value || !dataArray.value)
      return

    // Get frequency data for volume visualization
    analyser.value.getByteFrequencyData(dataArray.value)

    // Calculate RMS volume level
    let sum = 0
    for (let i = 0; i < dataArray.value.length; i++) {
      sum += dataArray.value[i] * dataArray.value[i]
    }
    const rms = Math.sqrt(sum / dataArray.value.length)
    volumeLevel.value = Math.min(100, (rms / 255) * 100 * 3) // Amplify for better visualization

    // Fallback speaking detection (when VAD model is not used)
    if (!useVADModel.value || !isVADModelLoaded.value) {
      isSpeaking.value = volumeLevel.value > speakingThreshold.value
    }

    // Collect audio samples for VAD processing
    if (useVADModel.value && isVADModelLoaded.value && audioChunkBuffer.value !== null) {
      // Get time domain data for VAD (raw audio samples)
      const timeDataArray = new Float32Array(analyser.value.fftSize)
      analyser.value.getFloatTimeDomainData(timeDataArray)

      // Append new samples to buffer
      const currentBuffer = audioChunkBuffer.value
      const newBuffer = new Float32Array(currentBuffer.length + timeDataArray.length)
      newBuffer.set(currentBuffer, 0)
      newBuffer.set(timeDataArray, currentBuffer.length)
      audioChunkBuffer.value = newBuffer
    }

    animationFrame.value = requestAnimationFrame(analyze)
  }
  analyze()
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

watch(audioInputs, () => {
  if (!selectedAudioInput.value && audioInputs.value.length > 0) {
    selectedAudioInput.value = audioInputs.value[0]?.deviceId
  }
})

watch(selectedAudioInput, async () => {
  if (isMonitoring.value) {
    await stopAudioMonitoring()
    await setupAudioMonitoring()
  }
})

// Monitoring toggle
async function toggleMonitoring() {
  if (isMonitoring.value) {
    await setupAudioMonitoring()
  }
  else {
    await stopAudioMonitoring()
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

// Lifecycle
onMounted(() => {
  devices.ensurePermissions().then(() => nextTick()).then(() => {
    if (audioInputs.value.length > 0 && !selectedAudioInput.value) {
      selectedAudioInput.value = audioInputs.value[0]?.deviceId
    }
  })
})

onUnmounted(() => {
  stopAudioMonitoring()
})
</script>

<template>
  <div class="space-y-6">
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
          v-model="isMonitoring"
          label="Enable Audio Monitoring"
          description="Start monitoring audio input levels and voice activity detection"
          @update:model-value="toggleMonitoring"
        />

        <!-- Audio Level Visualization -->
        <div v-if="isMonitoring" class="space-y-3">
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

              <div v-else-if="vadModelError" class="flex items-center gap-2 text-red-600 dark:text-red-400">
                <div class="text-sm" i-solar:close-circle-bold-duotone />
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
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
