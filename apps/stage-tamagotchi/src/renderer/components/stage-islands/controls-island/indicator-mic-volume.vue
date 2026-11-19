<script setup lang="ts">
import { useAudioAnalyzer } from '@proj-airi/stage-ui/composables'
import { useAudioContext } from '@proj-airi/stage-ui/stores/audio'
import { useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, watch } from 'vue'

const props = withDefaults(defineProps<{ colorClass?: string }>(), { colorClass: 'text-primary-500 dark:text-primary-200' })
const settingsAudio = useSettingsAudioDevice()
const { stream, listening } = storeToRefs(settingsAudio)

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
  if (!listening.value || !stream.value)
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
  watch([listening, stream], () => setup(), { immediate: true })
})

onUnmounted(() => teardown())
</script>

<template>
  <div :class="['flex items-center justify-center', props.colorClass]">
    <!-- The outline is the MingCute `mic-line` icon. The level fills its capsule from the bottom. -->
    <!-- The SVG fills the icon size class of the root. A fixed size moves the button baseline, and the button shifts. -->
    <svg class="size-full" viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="micLevel" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop :offset="`${100 - Math.round(normalized * 100)}%`" stop-color="currentColor" stop-opacity="0" />
          <stop :offset="`${100 - Math.round(normalized * 100)}%`" stop-color="currentColor" stop-opacity="0.95" />
        </linearGradient>
      </defs>
      <path fill="url(#micLevel)" d="M12 16a4 4 0 0 1-4-4V7a4 4 0 1 1 8 0v5a4 4 0 0 1-4 4Z" />
      <path
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-width="2"
        d="M12 19v2m0-2a7 7 0 0 1-6.93-6M12 19a7 7 0 0 0 6.929-6M12 16a4 4 0 0 1-4-4V7a4 4 0 1 1 8 0v5a4 4 0 0 1-4 4Z"
      />
    </svg>
  </div>
</template>
