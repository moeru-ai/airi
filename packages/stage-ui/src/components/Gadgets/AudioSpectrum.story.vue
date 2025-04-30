<script setup lang="ts">
import { FieldRange, Radio } from '@proj-airi/ui'
import { onBeforeUnmount, ref, watch } from 'vue'

import AudioSpectrum from './AudioSpectrum.vue'
import AudioSpectrumVisualizer from './AudioSpectrumVisualizer.vue'

// Create a mock oscillator to generate audio for demonstration
const audioContext = ref<AudioContext>()
const oscillator = ref<OscillatorNode>()
const mediaStream = ref<MediaStream>()
const isPlaying = ref(false)
const frequency = ref(440) // A4 note
const waveform = ref<OscillatorType>('sine')

// Available waveforms for demonstration
const waveforms: OscillatorType[] = ['sine', 'square', 'sawtooth', 'triangle']

function createMockAudioStream() {
  try {
    // Create audio context
    audioContext.value = new (window.AudioContext || (window as any).webkitAudioContext)()

    // Create oscillator
    oscillator.value = audioContext.value.createOscillator()
    oscillator.value.type = waveform.value
    oscillator.value.frequency.value = frequency.value

    // Create media stream destination
    const destination = audioContext.value.createMediaStreamDestination()

    // Connect oscillator to destination
    oscillator.value.connect(destination)

    // Get the stream
    mediaStream.value = destination.stream

    // Start the oscillator
    oscillator.value.start()
    isPlaying.value = true
  }
  catch (error) {
    console.error('Failed to create mock audio stream:', error)
  }
}

function stopMockAudioStream() {
  if (oscillator.value) {
    oscillator.value.stop()
    oscillator.value.disconnect()
    oscillator.value = undefined
  }

  if (audioContext.value) {
    audioContext.value.close()
    audioContext.value = undefined
  }

  mediaStream.value = undefined
  isPlaying.value = false
}

function toggleAudio() {
  if (isPlaying.value) {
    stopMockAudioStream()
  }
  else {
    createMockAudioStream()
  }
}

watch(frequency, (newFreq) => {
  if (oscillator.value) {
    oscillator.value.frequency.value = newFreq
  }
})

watch(waveform, (newWaveform) => {
  if (oscillator.value) {
    oscillator.value.type = newWaveform
  }
})

// Clean up on unmount
onBeforeUnmount(() => {
  stopMockAudioStream()
})
</script>

<template>
  <Story
    title="Audio Spectrum"
    group="gadgets"
    :layout="{ type: 'grid', width: '100%' }"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant
      id="interactive-demo"
      title="Interactive Demo"
    >
      <div class="rounded-xl bg-neutral-100 p-6 dark:bg-neutral-800">
        <div class="mb-6 flex flex-col gap-4">
          <div flex="~ row" items-center justify-between>
            <div>
              <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-400">
                Audio Spectrum
              </h2>
              <div text="neutral-400 dark:neutral-500">
                <span>Playground of Audio Spectrum component</span>
              </div>
            </div>
            <button
              class="rounded-lg px-4 py-2 font-medium transition-colors"
              :class="isPlaying
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : 'bg-primary-500 hover:bg-primary-600 text-white'"
              @click="toggleAudio"
            >
              {{ isPlaying ? 'Stop Audio' : 'Start Audio' }}
            </button>
          </div>

          <!-- Controls -->
          <div class="flex flex-col gap-4">
            <FieldRange
              v-model.number="frequency"
              :min="50"
              :max="2000"
              :step="1"
              label="Frequency"
            />

            <div class="grid grid-cols-2 gap-2">
              <Radio
                v-for="(w, index) of waveforms"
                id="waveform"
                :key="index"
                v-model="waveform"
                name="waveform"
                :value="w"
                :title="w"
              />
            </div>
          </div>
        </div>

        <!-- Visualizer -->
        <div class="h-40 overflow-hidden rounded-lg bg-neutral-200 p-4 dark:bg-neutral-900">
          <div v-if="!mediaStream" class="h-full flex items-center justify-center text-neutral-500">
            Click "Start Audio" to see the spectrum analyzer in action
          </div>
          <AudioSpectrum
            v-else
            v-slot="{ frequencies }"
            :stream="mediaStream"
            :bars="32"
            :min-freq="20"
            :max-freq="2000"
          >
            <AudioSpectrumVisualizer
              :frequencies="frequencies"
              bars-class="bg-primary-400 dark:bg-primary-500"
            />
          </AudioSpectrum>
        </div>

        <div class="mt-4 text-sm text-neutral-500">
          <p>This demo uses the Web Audio API to generate tones and visualize their frequency spectrum.</p>
          <p class="mt-1">
            Try changing the frequency and waveform to see how they affect the visualization.
          </p>
        </div>
      </div>
    </Variant>
  </Story>
</template>
