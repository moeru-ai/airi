<script setup lang="ts">
import { ref } from 'vue'

import { VADAudioManager } from '../libs/vad/manager'
import workletUrl from '../libs/vad/process.worklet?url'
import { createVAD } from '../libs/vad/vad'
import { toWav } from '../libs/vad/wav'

interface AudioSegment {
  buffer: Float32Array
  duration: number
  timestamp: number
  audioSrc: string
}

const audioManager = ref<VADAudioManager>()
const isInitialized = ref(false)
const isRunning = ref(false)
const isSpeechDetected = ref(false)
const segments = ref<AudioSegment[]>([])
const error = ref<string | null>(null)
const isModuleLoading = ref(false)

async function setupSpeechDetection() {
  try {
    isModuleLoading.value = true

    // Create and initialize the VAD
    const vad = await createVAD({
      sampleRate: 16000,
      speechThreshold: 0.3,
      exitThreshold: 0.1,
      minSilenceDurationMs: 400,
    })

    // Set up event handlers
    vad.on('speech-start', () => {
      isSpeechDetected.value = true
    })

    vad.on('speech-end', () => {
      isSpeechDetected.value = false
    })

    vad.on('speech-ready', async ({ buffer, duration }) => {
      const wavBuffer = toWav(buffer, 16000)
      const audioBlob = new Blob([wavBuffer], { type: 'audio/wav' })

      // Store the segment
      segments.value.push({
        buffer,
        duration: duration / 1000, // Convert to seconds for display
        timestamp: Date.now(),
        audioSrc: URL.createObjectURL(audioBlob),
      })
    })

    vad.on('status', ({ type, message }) => {
      if (type === 'error') {
        error.value = message
      }
    })

    // Create and initialize audio manager
    const m = new VADAudioManager(vad, {
      minChunkSize: 512,
      audioContextOptions: {
        sampleRate: 16000,
        latencyHint: 'interactive',
      },
    })

    await m.initialize(workletUrl)
    audioManager.value = m
    isInitialized.value = true
    isModuleLoading.value = false
    startVad()
  }
  catch (err) {
    console.error('Setup failed:', err)
    error.value = err instanceof Error ? err.message : String(err)
    isModuleLoading.value = false
  }
}

async function destroySpeechDetection() {
  await audioManager.value?.dispose()
  isInitialized.value = false
  isRunning.value = false
  isSpeechDetected.value = false

  for (const segment of segments.value) {
    URL.revokeObjectURL(segment.audioSrc)
  }

  segments.value = []
  error.value = null
  isModuleLoading.value = false
}

async function startVad() {
  try {
    await audioManager.value?.startMicrophone()
    isRunning.value = true
    error.value = null
  }
  catch (err) {
    console.error('Failed to start microphone:', err)
    error.value = err instanceof Error ? err.message : String(err)
  }
}

function stopVad() {
  audioManager.value?.stop()
  isRunning.value = false
  isSpeechDetected.value = false
}

function toggleListening() {
  if (isRunning.value) {
    stopVad()
  }
  else {
    startVad()
  }
}
</script>

<template>
  <div mb-6 h-full w-full flex flex-col gap-2>
    <div w-full flex-1>
      <div v-if="isModuleLoading" mt-20 flex items-center justify-center text-5xl>
        <div i-svg-spinners:3-dots-move />
      </div>

      <div v-if="error" class="error">
        {{ error }}
      </div>

      <div v-if="segments?.length && segments.length > 0" class="segments" w-full flex flex-col gap-2>
        <h3>Voice Segments ({{ segments.length }})</h3>
        <ul>
          <li v-for="(segment, index) in segments" :key="index" class="segment" flex flex-col gap-2>
            <div class="segment-info">
              <span>Duration: {{ segment.duration.toFixed(2) }}s</span>
            </div>
            <audio :src="segment.audioSrc" controls w-full />
          </li>
        </ul>
      </div>
    </div>

    <div w-full flex justify-center gap-4>
      <button aspect-square size-15 flex items-center justify-center rounded-full text-2xl :class="[isRunning ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900' : 'bg-neutral-900 dark:bg-white/20 text-white dark:text-white', isInitialized ? 'opacity-100' : 'opacity-0']" :disabled="!isInitialized" @click="toggleListening">
        <div i-solar:microphone-3-bold />
      </button>
      <button v-if="!isInitialized" bg="green-500 dark:green-500 hover:green-400 dark:hover:green-400 active:green-500 dark:active:green-500" transition="all duration-250 ease-in-out" aspect-square size-15 flex items-center justify-center rounded-full @click="setupSpeechDetection">
        <div i-solar:phone-rounded-bold text-4xl text-white />
      </button>
      <button v-else bg="red-500 dark:red-500 hover:red-400 dark:hover:red-400 active:red-500 dark:active:red-500" transition="all duration-250 ease-in-out" aspect-square size-15 flex items-center justify-center rounded-full text-4xl text-white @click="destroySpeechDetection">
        <div i-solar:end-call-rounded-bold />
      </button>
      <button aspect-square size-15 flex items-center justify-center rounded-full text-2xl class="bg-neutral-900 text-white dark:bg-neutral-900 dark:bg-white/20 dark:text-white" :class="isInitialized ? 'opacity-100' : 'opacity-0'" :disabled="!isInitialized">
        <div i-solar:headphones-round-bold />
      </button>
    </div>
  </div>
</template>
