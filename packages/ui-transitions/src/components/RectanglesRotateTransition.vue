<script setup lang="ts">
import type { StageTransitionCommonParams } from '.'

import { onMounted } from 'vue'

interface RecRotParams {
  /** Duration of the rotation, in seconds. */
  duration?: number
  /** Delay, in seconds. */
  delay?: number
  /** Stagger delay, in seconds. */
  staggerDelay?: number
  /** Rotation angle of the rotation, in degrees. */
  rotation?: number
}

const {
  primaryColor = '#ebcb8b',
  secondaryColor = '#c56370',
  tertiaryColor = '#43445b',
  duration = 0.6,
  delay = 0,
  staggerDelay = 0.1,
  rotation = 270,
  zIndex = 100,
} = defineProps<Omit<StageTransitionCommonParams, 'name'> & RecRotParams>()

onMounted(() => {
  // Set CSS variables for all three circles
  const setCssVar = (name: string, val: string) => document.documentElement.style.setProperty(name, val)
  setCssVar('--rectangle-rotate-1-color', primaryColor)
  setCssVar('--rectangle-rotate-2-color', secondaryColor)
  setCssVar('--rectangle-rotate-3-color', tertiaryColor)
  setCssVar('--rectangle-rotate-duration', `${duration}s`)
  setCssVar('--rectangle-rotate-delay', `${delay}s`)
  setCssVar('--rectangle-rotate-stagger', `${staggerDelay}s`)
  setCssVar('--rectangle-rotate-rotation', `${rotation}deg`)
})
</script>

<template>
  <div class="rectangle-rotate-transition" :style="{ zIndex }">
    <!-- First rectangle (top-left) -->
    <div class="rectangle rectangle-rotate-1">
      <div />
    </div>

    <!-- Second rectangle (bottom-right) -->
    <div class="rectangle rectangle-rotate-2">
      <div />
    </div>

    <!-- Third rectangle (center) -->
    <div class="rectangle rectangle-rotate-3">
      <div />
    </div>
  </div>
</template>

<style scoped>
.rectangle-rotate-transition {
  position: fixed;
  inset: 0;
  overflow: hidden;
}

.rectangle {
  position: absolute;
  width: 100%;
  height: 100%;
}

.rectangle div {
  position: absolute;
  width: 100vmax;
  height: 100vmax;
  transform: scale(0);
}

/* 1 - Top Left */
.rectangle-rotate-1 div {
  top: -50vmax;
  left: -50vmax;
  background-color: var(--rectangle-rotate-1-color);
  animation: expand-rotate var(--rectangle-rotate-duration) ease calc(var(--rectangle-rotate-delay) + 0s) forwards;
}

/* 2 - Bottom Right */
.rectangle-rotate-2 div {
  bottom: -50vmax;
  right: -50vmax;
  background-color: var(--rectangle-rotate-2-color);
  animation: expand-rotate var(--rectangle-rotate-duration) ease
    calc(var(--rectangle-rotate-delay) + var(--rectangle-rotate-stagger)) forwards;
}

/* 3 - Center */
.rectangle-rotate-3 div {
  top: calc(50% - 50vmax);
  left: calc(50% - 50vmax);
  background-color: var(--rectangle-rotate-3-color);
  animation: expand-rotate var(--rectangle-rotate-duration) ease
    calc(var(--rectangle-rotate-delay) + calc(var(--rectangle-rotate-stagger) * 2)) forwards;
}

@keyframes expand-rotate {
  from {
    transform: scale(0) rotate(0deg);
  }

  to {
    transform: scale(1) rotate(var(--rectangle-rotate-rotation));
  }
}
</style>
