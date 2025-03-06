<script setup lang="ts">
import { onMounted } from 'vue'

const props = withDefaults(defineProps<{
  primaryColor?: string
  secondaryColor?: string
  tertiaryColor?: string
  duration?: number
  delay?: number
  rotation?: number
  staggerDelay?: number
}>(), {
  primaryColor: '#ebcb8b', // First circle (top-left)
  secondaryColor: '#c56370', // Second circle (bottom-right)
  tertiaryColor: '#43445b', // Third circle (center)
  duration: 0.6,
  delay: 0,
  rotation: 270,
  staggerDelay: 0.1, // Delay between each circle animation
})

onMounted(() => {
  // Set CSS variables for all three circles
  document.documentElement.style.setProperty('--rectangle-rotate-1-color', props.primaryColor)
  document.documentElement.style.setProperty('--rectangle-rotate-2-color', props.secondaryColor)
  document.documentElement.style.setProperty('--rectangle-rotate-3-color', props.tertiaryColor)
  document.documentElement.style.setProperty('--rectangle-rotate-duration', `${props.duration}s`)
  document.documentElement.style.setProperty('--rectangle-rotate-delay', `${props.delay}s`)
  document.documentElement.style.setProperty('--rectangle-rotate-stagger', `${props.staggerDelay}s`)
  document.documentElement.style.setProperty('--rectangle-rotate-rotation', `${props.rotation}deg`)
})
</script>

<template>
  <div class="rectangle-rotate-transition">
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
  position: absolute;
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
