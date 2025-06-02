<script setup lang="ts">
import { nextTick, ref } from 'vue'

const props = withDefaults(defineProps<{
  blinkSpeed?: string
  flashFrequency?: string
  glitchOffset?: string
  blurAmount?: string
  glitchAmplitude?: string
}>(), {
  blinkSpeed: '2s',
  flashFrequency: '0.06s',
  glitchOffset: '1px',
  blurAmount: '0.8px',
  glitchAmplitude: '20deg',
})

const scrollContainerRef = ref<HTMLDivElement>()

async function handleWriteLine() {
  if (scrollContainerRef.value) {
    await nextTick()
    scrollContainerRef.value.scrollTop = scrollContainerRef.value.scrollHeight
  }
}

defineExpose({
  handleWriteLine,
})
</script>

<template>
  <div
    h="[50dvh]" class="terminal-screen after:(pointer-events-none absolute inset-0 rounded-2xl content-[''])" font-retro-mono rounded-8xl relative w-full p-4
    :style="{
      '--glitch-blink-speed': props.blinkSpeed,
      '--glitch-flash-freq': props.flashFrequency,
      '--glitch-offset': props.glitchOffset,
      '--glitch-blur': props.blurAmount,
      '--glitch-amplitude': props.glitchAmplitude,
    }"
  >
    <div ref="scrollContainerRef" h="full" flex flex-col overflow-y-auto outline-none>
      <slot />
    </div>
  </div>
</template>

<style scoped>
.terminal-screen::after {
  background: repeating-linear-gradient(
    0deg,
    rgba(200, 200, 200, 0.09),
    rgba(200, 200, 200, 0.09) 1px,
    transparent 1px,
    transparent 2px
  );
}

.dark .terminal-screen::after {
  background: repeating-linear-gradient(
    0deg,
    rgba(42, 42, 42, 0.15),
    rgba(49, 49, 49, 0.15) 1px,
    transparent 1px,
    transparent 2px
  );
}
</style>
