<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import Alert from '../Misc/Alert.vue'
import VoiceCard from './VoiceCard.vue'

interface VoiceLanguage {
  name: string
  code: string
}

interface Voice {
  id: string
  name: string
  description?: string
  previewURL?: string
  preview_audio_url?: string // Alternative field name
  deprecated?: boolean
  customizable?: boolean
  labels?: {
    accent?: string
    age?: string
    gender?: string
    type?: string
  }
  languages?: VoiceLanguage[]
  tags?: string[]
}

interface Props {
  voices: Voice[]
  searchable?: boolean
  searchPlaceholder?: string
  searchNoResultsTitle?: string
  searchNoResultsDescription?: string
  searchResultsText?: string
  customInputPlaceholder?: string
  expandButtonText?: string
  collapseButtonText?: string
  playButtonText?: string
  pauseButtonText?: string
  showVisualizer?: boolean
  listClass?: string
}

const props = withDefaults(defineProps<Props>(), {
  searchable: true,
  searchPlaceholder: 'Search voices...',
  searchNoResultsTitle: 'No voices found',
  searchNoResultsDescription: 'Try a different search term',
  searchResultsText: '{count} of {total} voices',
  customInputPlaceholder: 'Enter custom voice name',
  expandButtonText: 'Show more',
  collapseButtonText: 'Show less',
  playButtonText: 'Play sample',
  pauseButtonText: 'Pause',
  showVisualizer: true,
  listClass: '',
})

const isListExpanded = ref(false)
const currentlyPlayingId = ref<string>()
const audioElements = ref<Map<string, HTMLAudioElement>>(new Map())
const audioStreams = ref<Map<string, MediaStream>>(new Map())
const audioContexts = ref<Map<string, AudioContext>>(new Map())
const audioSources = ref<Map<string, MediaElementAudioSourceNode>>(new Map())

// Add a single shared audio context
const sharedAudioContext = ref<AudioContext | null>(null)

// Initialize the shared audio context (call this in mounted or when needed)
function initAudioContext() {
  if (!sharedAudioContext.value) {
    sharedAudioContext.value = new (window.AudioContext || (window as any).webkitAudioContext)()
  }
  return sharedAudioContext.value
}

const searchQuery = defineModel<string>('search-query', { required: false, default: '' })
const voiceId = defineModel<string>('voice-id', { required: false, default: '' })

// Filter voices based on search query
const filteredVoices = computed(() => {
  if (!searchQuery.value)
    return props.voices

  const query = searchQuery.value.toLowerCase()
  return props.voices.filter((voice) => {
    // Search in name and description
    const nameMatch = voice.name.toLowerCase().includes(query)
    const descMatch = voice.description && voice.description.toLowerCase().includes(query)

    // Search in tags
    const tagMatch = voice.tags && voice.tags.some(tag => tag.toLowerCase().includes(query))

    // Search in labels
    const labelMatch = voice.labels && Object.values(voice.labels).some(
      value => typeof value === 'string' && value.toLowerCase().includes(query),
    )

    // Search in languages
    const langMatch = voice.languages && voice.languages.some(
      lang => lang.name.toLowerCase().includes(query) || lang.code.toLowerCase().includes(query),
    )

    return nameMatch || descMatch || tagMatch || labelMatch || langMatch
  })
})

// Get preview URL from either field
function getPreviewUrl(voice: Voice): string | undefined {
  return voice.previewURL || voice.preview_audio_url
}

// Create or get audio element for a voice
function getAudioElement(voice: Voice): HTMLAudioElement | null {
  const previewUrl = getPreviewUrl(voice)
  if (!previewUrl)
    return null

  if (audioElements.value.has(voice.id)) {
    return audioElements.value.get(voice.id) || null
  }

  const audio = new Audio(previewUrl)
  audio.crossOrigin = 'anonymous' // This is crucial for CORS
  audio.preload = 'auto' // Preload the audio

  audio.addEventListener('ended', () => {
    if (currentlyPlayingId.value === voice.id) {
      currentlyPlayingId.value = undefined

      // Clean up the stream when audio ends
      const stream = audioStreams.value.get(voice.id)
      if (stream) {
        stream.getTracks().forEach(track => track.stop())
        audioStreams.value.delete(voice.id)
      }
    }
  })

  audioElements.value.set(voice.id, audio)
  return audio
}

// Create audio stream for visualizer
function createAudioStream(audio: HTMLAudioElement, voiceId: string): MediaStream | null {
  try {
    // If we already have a stream for this voice, return it
    if (audioStreams.value.has(voiceId)) {
      return audioStreams.value.get(voiceId) || null
    }

    // Get the shared audio context
    const audioContext = initAudioContext()

    // Check if we already have a source for this audio element
    if (audioSources.value.has(voiceId)) {
      const source = audioSources.value.get(voiceId)!
      const destination = audioContext.createMediaStreamDestination()
      source.connect(destination)

      const stream = destination.stream
      audioStreams.value.set(voiceId, stream)
      return stream
    }

    // Create a new source node
    const source = audioContext.createMediaElementSource(audio)
    audioSources.value.set(voiceId, source)

    // Connect to the audio context destination (speakers)
    source.connect(audioContext.destination)

    // Create a stream destination for visualization
    const destination = audioContext.createMediaStreamDestination()
    source.connect(destination)

    const stream = destination.stream
    audioStreams.value.set(voiceId, stream)
    return stream
  }
  catch (error) {
    console.error('Failed to create audio stream for visualizer:', error)
    return null
  }
}

// Play or pause audio preview
function togglePlayback(voice: Voice) {
  try {
    const previewUrl = getPreviewUrl(voice)
    if (!previewUrl)
      return

    const audio = getAudioElement(voice)
    if (!audio)
      return

    // If this voice is currently playing, pause it
    if (currentlyPlayingId.value === voice.id) {
      audio.pause()
      currentlyPlayingId.value = undefined

      // Clean up the stream
      const stream = audioStreams.value.get(voice.id)
      if (stream) {
        stream.getTracks().forEach(track => track.stop())
        audioStreams.value.delete(voice.id)
      }
      return
    }

    // If another voice is playing, pause it first
    if (currentlyPlayingId.value) {
      const currentAudio = audioElements.value.get(currentlyPlayingId.value)
      if (currentAudio) {
        currentAudio.pause()
      }

      // Clean up the previous stream
      const stream = audioStreams.value.get(currentlyPlayingId.value)
      if (stream) {
        stream.getTracks().forEach(track => track.stop())
        audioStreams.value.delete(currentlyPlayingId.value)
      }
    }

    // Create audio stream for visualizer if needed
    if (props.showVisualizer && !audioStreams.value.has(voice.id)) {
      createAudioStream(audio, voice.id)
    }

    // Play the selected voice
    audio.currentTime = 0
    audio.play().catch((error) => {
      console.error('Failed to play audio:', error)
    })

    currentlyPlayingId.value = voice.id
  }
  catch (err) {
    console.error(err)
    currentlyPlayingId.value = undefined
  }
}

// Clean up audio elements when component is unmounted
function cleanup() {
  audioElements.value.forEach((audio) => {
    audio.pause()
    audio.src = ''
  })
  audioElements.value.clear()

  // Clean up all streams
  audioStreams.value.forEach((stream) => {
    stream.getTracks().forEach(track => track.stop())
  })
  audioStreams.value.clear()

  // Close all audio contexts
  audioContexts.value.forEach((context) => {
    if (context.state !== 'closed') {
      context.close()
    }
  })
  audioContexts.value.clear()
  audioSources.value.clear()

  currentlyPlayingId.value = undefined
}

// Stop all audio when search query changes
watch(searchQuery, () => {
  if (currentlyPlayingId.value) {
    const audio = audioElements.value.get(currentlyPlayingId.value)
    if (audio) {
      audio.pause()
    }

    // Clean up the stream
    const stream = audioStreams.value.get(currentlyPlayingId.value)
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
      audioStreams.value.delete(currentlyPlayingId.value)
    }

    currentlyPlayingId.value = undefined
  }
})

// Clean up when component is unmounted
onBeforeUnmount(cleanup)

// Add this to the script section
const customVoiceName = ref('')
</script>

<template>
  <div class="voice-preview-player">
    <!-- Search bar -->
    <div v-if="searchable" class="relative" inline-flex="~" w-full items-center>
      <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
        <div i-solar:magnifer-line-duotone class="text-neutral-500 dark:text-neutral-400" />
      </div>
      <input
        v-model="searchQuery"
        type="search"
        class="w-full rounded-xl p-2.5 pl-10 text-sm outline-none"
        border="focus:primary-100 dark:focus:primary-400/50 2 solid neutral-200 dark:neutral-800"
        transition="all duration-200 ease-in-out"
        bg="white dark:neutral-900"
        :placeholder="searchPlaceholder"
      >
    </div>

    <!-- Items list with search results info -->
    <div class="mt-4 space-y-2">
      <!-- Search results info -->
      <div v-if="searchQuery" class="text-sm text-neutral-500 dark:text-neutral-400">
        {{ searchResultsText.replace('{count}', filteredVoices.length.toString()).replace('{total}', voices.length.toString()) }}
      </div>

      <!-- No search results -->
      <Alert v-if="searchQuery && filteredVoices.length === 0" type="warning">
        <template #title>
          {{ searchNoResultsTitle }}
        </template>
        <template #content>
          {{ searchNoResultsDescription.replace('{query}', searchQuery) }}
        </template>
      </Alert>

      <!-- Voices grid -->
      <div class="relative">
        <!-- Horizontally scrollable container -->
        <div
          class="grid auto-cols-[350px] grid-flow-col gap-4 overflow-x-auto scrollbar-none"
          :class="[
            isListExpanded ? 'grid-cols-1 md:grid-cols-2 grid-flow-row auto-cols-auto' : '',
            ...(props.listClass
              ? (typeof props.listClass === 'string'
                ? [props.listClass]
                : props.listClass
              )
              : ['max-h-[calc(100dvh-7lh)]']
            ),
          ]"
          transition="all duration-200 ease-in-out"
          style="scroll-snap-type: x mandatory;"
        >
          <!-- Voice card with preview button -->
          <VoiceCard
            v-for="voice in filteredVoices"
            :key="voice.id"
            v-model:voice-id="voiceId"
            v-model:custom-voice-name="customVoiceName"
            name="voice"
            :voice="voice"
            :currently-playing-id="currentlyPlayingId"
            :custom-input-placeholder="customInputPlaceholder"
            :show-visualizer="showVisualizer"
            :audio-stream="audioStreams.get(voice.id)"
            @toggle-playback="togglePlayback"
          />
        </div>

        <!-- Expand/collapse handle -->
        <div
          bg="neutral-100 dark:[rgba(0,0,0,0.3)]"
          rounded-xl
          :class="[
            isListExpanded ? 'w-full' : 'mt-4 w-full rounded-lg',
          ]"
        >
          <button
            w-full
            flex items-center justify-center gap-2 rounded-lg py-2 transition="all duration-200 ease-in-out"
            :class="[
              isListExpanded ? 'bg-primary-500 hover:bg-primary-600 text-white' : 'bg-white dark:bg-neutral-900 hover:bg-neutral-100 dark:hover:bg-neutral-800',
            ]"
            @click="isListExpanded = !isListExpanded"
          >
            <span>{{ isListExpanded ? collapseButtonText : expandButtonText }}</span>
            <div
              :class="isListExpanded ? 'rotate-180' : ''"
              i-solar:alt-arrow-down-linear transition="transform duration-200 ease-in-out"
              class="text-lg"
            />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
input[type='search']::-webkit-search-cancel-button {
  display: none;
}

.voice-card {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.voice-card::before {
  pointer-events: none;
  --at-apply: 'bg-gradient-to-r from-primary-500/0 to-primary-500/0 dark:from-primary-400/0 dark:to-primary-400/0';
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 25%;
  height: 100%;
  transition: all 0.35s ease-in-out;
  mask-image: linear-gradient(120deg, white 100%);
  opacity: 0;
}

.voice-card:hover::before {
  --at-apply: 'bg-gradient-to-r from-primary-500/20 via-primary-500/10 to-transparent dark:from-primary-400/20 dark:via-primary-400/10 dark:to-transparent';
  width: 85%;
  opacity: 1;
}
</style>
