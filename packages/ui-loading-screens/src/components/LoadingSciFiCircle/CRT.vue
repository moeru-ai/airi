<script setup lang="ts">
import { nextTick, ref } from 'vue'

import BarrelDistortionMap from './assets/barrel_distortion_map.avif'

const props = withDefaults(defineProps<{
  blinkSpeed?: string
  flashFrequency?: string
  glitchOffset?: string
  blurAmount?: string
  glitchAmplitude?: string
  barrelDistortion?: boolean
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
  <!-- More fantastic SVG filters: https://www.smashingmagazine.com/2021/09/deep-dive-wonderful-world-svg-displacement-filtering/ -->
  <svg
    v-if="props.barrelDistortion"
    xmlns="http://www.w3.org/2000/svg"
    xmlns:xlink="http://www.w3.org/1999/xlink"
    width="100%" height="100%"
    viewBox="0 0 128 128"
    z-index="-1" absolute left-0 top-0
  >
    <defs>
      <filter id="svgFilterBarrelDistortion" filterUnits="objectBoundingBox" x="-20%" y="-20%" width="120%" height="140%">
        <feImage result="Map" :href="BarrelDistortionMap" />
        <feDisplacementMap in="SourceGraphic" in2="map" scale="20" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </defs>
  </svg>

  <div
    v-bind="$attrs"
    h="[50dvh]" class="terminal-screen after:(pointer-events-none absolute inset-0 rounded-2xl content-[''])"
    font-retro-mono rounded-8xl relative w-full p-4
    :style="{
      '--glitch-blink-speed': props.blinkSpeed,
      '--glitch-flash-freq': props.flashFrequency,
      '--glitch-offset': props.glitchOffset,
      '--glitch-blur': props.blurAmount,
      '--glitch-amplitude': props.glitchAmplitude,
      ...props.barrelDistortion ? { filter: 'url(#svgFilterBarrelDistortion)' } : null,
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
