<script setup lang="ts">
import { useAudioAnalyzer } from '@proj-airi/stage-ui/composables'
import { useAudioContext } from '@proj-airi/stage-ui/stores/audio'
import { useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, watch } from 'vue'

const props = withDefaults(defineProps<{ colorClass?: string }>(), { colorClass: 'text-primary-500 dark:text-primary-200' })
const settingsAudio = useSettingsAudioDevice()
const { stream, enabled } = storeToRefs(settingsAudio)

const { audioContext } = storeToRefs(useAudioContext())
const { startAnalyzer, stopAnalyzer, volumeLevel } = useAudioAnalyzer()

let source: MediaStreamAudioSourceNode | undefined

const normalized = computed(() => Math.min(1, (volumeLevel.value ?? 0) / 100))

function teardown() {
  try {
    source?.disconnect()
  }
  catch {

  }

  source = undefined
  stopAnalyzer()
}

async function setup() {
  teardown()
  if (!enabled.value || !stream.value)
    return

  const ctx = audioContext.value
  // Ensure context is running
  if (ctx.state === 'suspended')
    await ctx.resume()
  const analyser = startAnalyzer(ctx)
  if (!analyser)
    return
  source = ctx.createMediaStreamSource(stream.value)
  source.connect(analyser)
}

onMounted(() => {
  watch([enabled, stream], () => setup(), { immediate: true })
})

onUnmounted(() => teardown())
</script>

<template>
  <div :class="['flex items-center justify-center', props.colorClass]">
    <!-- Inline SVG mic with level fill using gradient stops -->
    <svg width="24" height="24" viewBox="0 0 256 256" aria-hidden="true">
      <defs>
        <linearGradient id="micLevel" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="currentColor" stop-opacity="0" />
          <stop :offset="`${100 - Math.round(normalized * 100)}%`" stop-color="currentColor" stop-opacity="0" />
          <stop :offset="`${100 - Math.round(normalized * 100)}%`" stop-color="currentColor" stop-opacity="0.95" />
          <stop offset="100%" stop-color="currentColor" stop-opacity="0.95" />
        </linearGradient>
      </defs>
      <!-- Fill with level gradient -->
      <path
        fill="url(#micLevel)"
        d="M128 176a48.05 48.05 0 0 0 48-48V64a48 48 0 0 0-96 0v64a48.05 48.05 0 0 0 48 48M96 64a32 32 0 0 1 64 0v64a32 32 0 0 1-64 0Zm40 143.6V240a8 8 0 0 1-16 0v-32.4A80.11 80.11 0 0 1 48 128a8 8 0 0 1 16 0a64 64 0 0 0 128 0a8 8 0 0 1 16 0a80.11 80.11 0 0 1-72 79.6"
      />
      <!-- Outline -->
      <path
        fill="none"
        stroke="currentColor"
        stroke-opacity="1"
        stroke-width="2"
        d="M128 176a48.05 48.05 0 0 0 48-48V64a48 48 0 0 0-96 0v64a48.05 48.05 0 0 0 48 48M96 64a32 32 0 0 1 64 0v64a32 32 0 0 1-64 0Zm40 143.6V240a8 8 0 0 1-16 0v-32.4A80.11 80.11 0 0 1 48 128a8 8 0 0 1 16 0a64 64 0 0 0 128 0a8 8 0 0 1 16 0a80.11 80.11 0 0 1-72 79.6"
      />
    </svg>
  </div>
</template>
