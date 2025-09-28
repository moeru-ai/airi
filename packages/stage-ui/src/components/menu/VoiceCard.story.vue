<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'

import VoiceCard from './VoiceCard.vue'

// Sample voice data
const selectedVoiceId = ref('lNxY9WuCBCZCISASyJ55')
const currentlyPlayingId = ref<string>()
const customInputValue = ref('')
const audioElement = ref<HTMLAudioElement>()
const mediaStream = ref<MediaStream | null>(null)

// Mock voices with different configurations
const voice = computed(() => ({
  id: 'lNxY9WuCBCZCISASyJ55',
  name: 'Myriam',
  previewURL: 'https://storage.googleapis.com/eleven-public-prod/MCJE2vSmnChGnvdoSpbNO0dcNQw2/voices/MRCOs26Xkzk5vmsL1Q0D/b0a09f0d-6a02-486f-af95-94a0e5306dbd.mp3',
  customizable: true,
  labels: {
    gender: 'Female',
    age: 'Young',
    accent: 'American',
  },
  languages: [
    { name: 'English', code: 'en-US' },
  ],
}))

// Toggle playback function
function togglePlayback(voice: { id: string }) {
  if (currentlyPlayingId.value === voice.id) {
    stopAudio()
  }
  else {
    playAudio(voice.id)
  }
}

// Play audio and create stream for visualization
function playAudio(voiceId: string) {
  // Stop any currently playing audio
  if (audioElement.value && !audioElement.value.paused) {
    stopAudio()
  }

  // Create new audio element
  audioElement.value = new Audio(voice.value.previewURL)
  audioElement.value.crossOrigin = 'anonymous' // Important for CORS

  // Set up audio context and stream when audio can play
  audioElement.value.oncanplay = () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()

      // Create audio analyzer for visualization
      const analyzer = audioContext.createAnalyser()
      analyzer.fftSize = 2048

      // Create oscillator as a workaround for CORS restrictions
      // This creates a synthetic audio stream that we can visualize
      const oscillator = audioContext.createOscillator()
      oscillator.frequency.value = 440 // Default frequency

      // Create media stream destination for visualization
      const destination = audioContext.createMediaStreamDestination()

      // Connect oscillator to analyzer and destination
      oscillator.connect(analyzer)
      analyzer.connect(destination)

      // Start the oscillator
      oscillator.start()

      // Set the media stream for visualization
      mediaStream.value = destination.stream

      // Start audio playback
      audioElement.value?.play()

      // Update playing state
      currentlyPlayingId.value = voiceId

      // Set up audio time update to modulate the oscillator
      // This creates a visualization that roughly follows the audio
      audioElement.value!.ontimeupdate = () => {
        // Modulate oscillator frequency based on current time
        // This is just for visual effect and doesn't represent the actual audio spectrum
        if (oscillator && audioElement.value) {
          const time = audioElement.value.currentTime
          const duration = audioElement.value.duration || 1
          const progress = time / duration

          // Create some variation in the visualization
          oscillator.frequency.value = 220 + (880 * Math.sin(progress * Math.PI * 2))
        }
      }

      // Handle audio ending
      audioElement.value!.onended = () => {
        stopAudio()
      }
    }
    catch (error) {
      console.error('Failed to create audio stream:', error)
      // Fallback to just playing audio without visualization
      currentlyPlayingId.value = voiceId
    }
  }

  // Handle load errors
  audioElement.value.onerror = () => {
    console.error('Error loading audio')
    currentlyPlayingId.value = undefined
  }

  // Start loading the audio
  audioElement.value.load()
}

// Stop audio playback and clean up
function stopAudio() {
  if (audioElement.value != null) {
    audioElement.value.pause()
    audioElement.value = undefined
  }

  mediaStream.value = null
  currentlyPlayingId.value = undefined
}

// Clean up on unmount
onBeforeUnmount(() => {
  stopAudio()
})
</script>

<template>
  <Story
    title="Voice Card"
    group="menu"
    :layout="{ type: 'grid', width: '100%' }"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant
      id="default"
      title="Default Voice Card"
    >
      <div class="w-full">
        <VoiceCard
          v-model:voice-id="selectedVoiceId"
          v-model:custom-voice-name="customInputValue"
          :voice="voice"
          name="voice-card"
          :currently-playing-id="currentlyPlayingId"
          :audio-stream="mediaStream"
          @toggle-playback="togglePlayback"
        />

        <div class="mt-4 text-sm text-neutral-500">
          <p>This demo shows a voice card with audio playback and visualization.</p>
          <p class="mt-1">
            The visualization is synthetic and doesn't represent the actual audio spectrum due to CORS restrictions.
          </p>
        </div>
      </div>
    </Variant>
  </Story>
</template>
