<script setup lang="ts">
import { computed } from 'vue'

import AudioSpectrum from '../Gadgets/AudioSpectrum.vue'
import AudioSpectrumVisualizer from '../Gadgets/AudioSpectrumVisualizer.vue'
import TransitionVertical from '../TransitionVertical.vue'
import Input from './Input/Input.vue'

interface VoiceLanguage {
  name: string
  code: string
}

interface Voice {
  id: string
  name: string
  description?: string
  previewURL?: string
  preview_audio_url?: string
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
  voice: Voice
  selectedVoiceId: string
  currentlyPlayingId?: string
  customInputPlaceholder?: string
  showVisualizer?: boolean
  audioStream?: MediaStream | null
}

const props = withDefaults(defineProps<Props>(), {
  customInputPlaceholder: 'Enter custom voice name',
  showVisualizer: true,
  audioStream: null,
})

const emit = defineEmits<{
  'select': [voiceId: string]
  'togglePlayback': [voice: Voice]
  'update:modelValue': [value: string]
}>()

const modelValue = computed({
  get: () => '',
  set: value => emit('update:modelValue', value),
})

// Get preview URL from either field
function getPreviewUrl(voice: Voice): string | undefined {
  return voice.previewURL || voice.preview_audio_url
}

// Format voice attributes for display
function formatVoiceAttributes(voice: Voice): string[] {
  const attributes = []

  // Add gender if available
  if (voice.labels?.gender) {
    attributes.push(voice.labels.gender)
  }

  // Add age if available
  if (voice.labels?.age) {
    attributes.push(voice.labels.age)
  }

  // Add accent if available
  if (voice.labels?.accent) {
    attributes.push(voice.labels.accent)
  }

  // Add languages if available
  if (voice.languages && voice.languages.length > 0) {
    const languageNames = voice.languages.map(lang => lang.name).join(', ')
    attributes.push(languageNames)
  }

  return attributes
}

function selectVoice() {
  emit('select', props.voice.id)
}

function togglePlayback() {
  emit('togglePlayback', props.voice)
}
</script>

<template>
  <div
    class="scroll-snap-align-start voice-card relative flex flex-col overflow-hidden rounded-xl"
    transition="all duration-200 ease-in-out"
    border="2 solid"
    :class="[
      selectedVoiceId === voice.id
        ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-100 dark:border-primary-900 hover:border-primary-500/30 dark:hover:border-primary-400/30'
        : 'bg-white dark:bg-neutral-900/20 border-neutral-100 dark:border-neutral-700 hover:border-primary-500/30 dark:hover:border-primary-400/30',
      voice.deprecated ? 'opacity-60' : '',
    ]"
  >
    <!-- Voice info section -->
    <div class="p-3">
      <div class="flex items-start">
        <!-- Radio button -->
        <div class="relative mr-3 mt-0.5 flex-shrink-0" @click="selectVoice">
          <div
            class="size-5 cursor-pointer border-2 rounded-full transition-colors duration-200"
            :class="[
              selectedVoiceId === voice.id
                ? 'border-primary-500 dark:border-primary-400'
                : 'border-neutral-300 dark:border-neutral-600',
            ]"
          >
            <div
              class="absolute left-1/2 top-1/2 size-3 rounded-full transition-opacity duration-200 -translate-x-1/2 -translate-y-1/2"
              :class="[
                selectedVoiceId === voice.id
                  ? 'opacity-100 bg-primary-500 dark:bg-primary-400'
                  : 'opacity-0',
              ]"
            />
          </div>
        </div>

        <!-- Audio preview button -->
        <button
          v-if="getPreviewUrl(voice)"
          absolute right-0 top="0" z-100
          class="translate-x-[-50%] translate-y-[50%]"
          :class="[
            currentlyPlayingId === voice.id
              ? 'text-white dark:text-white'
              : '',
          ]"
          @click="togglePlayback"
        >
          <div v-if="currentlyPlayingId === voice.id" i-solar:pause-circle-bold-duotone class="text-xl" />
          <div v-else i-solar:play-circle-bold-duotone class="text-xl" />
        </button>
        <div
          v-else
          class="mt-auto w-full flex items-center justify-center bg-neutral-50 py-3 text-xs text-neutral-400 italic dark:bg-neutral-800/50 dark:text-neutral-600"
        >
          No preview available
        </div>

        <!-- Voice info -->
        <div class="flex-1 cursor-pointer" @click="selectVoice">
          <div class="flex items-center">
            <span
              class="line-clamp-1 font-medium"
              :class="[
                selectedVoiceId === voice.id
                  ? 'text-neutral-700 dark:text-neutral-300'
                  : 'text-neutral-700 dark:text-neutral-400',
              ]"
            >
              {{ voice.name }}
            </span>
          </div>

          <!-- Voice attributes (gender, age, accent, etc.) -->
          <div v-if="formatVoiceAttributes(voice).length > 0" class="mt-1 flex flex-wrap gap-1">
            <span
              v-for="(attribute, attrIndex) in formatVoiceAttributes(voice)"
              :key="attrIndex"
              class="inline-flex items-center rounded-md px-1.5 py-0.5 text-xs"
              :class="[
                selectedVoiceId === voice.id
                  ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                  : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
              ]"
            >
              {{ attribute }}
            </span>
          </div>

          <!-- Custom input field for selected voice -->
          <div v-if="voice.customizable && selectedVoiceId === voice.id" class="mt-3">
            <Input
              v-model="modelValue"
              type="text"
              class="w-full border border-neutral-300 rounded bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
              :placeholder="customInputPlaceholder"
            />
          </div>

          <!-- Voice description -->
          <div
            v-if="voice.description" class="line-clamp-2 mt-1 text-xs"
            :class="[
              selectedVoiceId === voice.id
                ? 'text-neutral-600 dark:text-neutral-400'
                : 'text-neutral-500 dark:text-neutral-500',
            ]"
          >
            {{ voice.description }}
          </div>
        </div>
      </div>
    </div>

    <!-- Audio visualizer section -->
    <div relative>
      <TransitionVertical>
        <div
          v-if="showVisualizer && currentlyPlayingId === voice.id && audioStream"
          class="h-16 px-3 pb-2"
        >
          <AudioSpectrum
            v-slot="{ frequencies }"
            :stream="audioStream"
            :bars="24"
            :min-freq="60"
            :max-freq="4000"
          >
            <AudioSpectrumVisualizer
              :frequencies="frequencies"
              :bars-class="selectedVoiceId === voice.id
                ? 'bg-primary-500 dark:bg-primary-400'
                : 'bg-neutral-400 dark:bg-neutral-600'"
            />
          </AudioSpectrum>
        </div>
      </TransitionVertical>
    </div>
  </div>
</template>

<style scoped>
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
