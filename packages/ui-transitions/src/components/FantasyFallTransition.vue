<script setup lang="ts">
import { computed, onMounted } from 'vue'

const props = defineProps <{
  stageTransition?: {
    primaryColor?: string
    duration?: number
    delay?: number
    direction?: 'up' | 'down' | 'left' | 'right'
    borderRadius?: {
      sm?: string
      md?: string
      lg?: string
    }
    zIndex?: number
  }
}>()

const direction = computed(() => props.stageTransition?.direction || 'up')
const directionClass = computed(() => `fantasy-fall-${direction.value}`)

onMounted(() => {
  document.documentElement.style.setProperty('--fantasy-fall-color', props.stageTransition?.primaryColor || '#eee')
  document.documentElement.style.setProperty('--fantasy-fall-duration', `${props.stageTransition?.duration || 0.6}s`)
  document.documentElement.style.setProperty('--fantasy-fall-delay', `${props.stageTransition?.delay || 0}s`)
  document.documentElement.style.setProperty('--fantasy-fall-radius-sm', `${props.stageTransition?.borderRadius?.sm || '14rem'}`)
  document.documentElement.style.setProperty('--fantasy-fall-radius-md', `${props.stageTransition?.borderRadius?.md || '14rem'}`)
  document.documentElement.style.setProperty('--fantasy-fall-radius-lg', `${props.stageTransition?.borderRadius?.lg || '50%'}`)
})
</script>

<template>
  <div class="fantasy-fall-transition" :class="directionClass" :style="{ zIndex: stageTransition?.zIndex ?? 100 }" />
</template>

<style scoped>
.fantasy-fall-transition {
  position: fixed;
  inset: 0;
  overflow: hidden;
}

/* Top direction (default) */
.fantasy-fall-up::before {
  content: '';
  display: block;
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: var(--fantasy-fall-color);
  transform: translateY(-100%);
  border-bottom-left-radius: var(--fantasy-fall-radius-sm);
  border-bottom-right-radius: var(--fantasy-fall-radius-sm);
  animation: fantasy-fall-up var(--fantasy-fall-duration) ease-out var(--fantasy-fall-delay) forwards;
}

/* Bottom direction */
.fantasy-fall-down::before {
  content: '';
  display: block;
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: var(--fantasy-fall-color);
  transform: translateY(100%);
  border-top-left-radius: var(--fantasy-fall-radius-sm);
  border-top-right-radius: var(--fantasy-fall-radius-sm);
  animation: fantasy-fall-down var(--fantasy-fall-duration) ease-out var(--fantasy-fall-delay) forwards;
}

/* Left direction */
.fantasy-fall-left::before {
  content: '';
  display: block;
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: var(--fantasy-fall-color);
  transform: translateX(-100%);
  border-top-right-radius: var(--fantasy-fall-radius-sm);
  border-bottom-right-radius: var(--fantasy-fall-radius-sm);
  animation: fantasy-fall-left var(--fantasy-fall-duration) ease-out var(--fantasy-fall-delay) forwards;
}

/* Right direction */
.fantasy-fall-right::before {
  content: '';
  display: block;
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: var(--fantasy-fall-color);
  transform: translateX(100%);
  border-top-left-radius: var(--fantasy-fall-radius-sm);
  border-bottom-left-radius: var(--fantasy-fall-radius-sm);
  animation: fantasy-fall-right var(--fantasy-fall-duration) ease-out var(--fantasy-fall-delay) forwards;
}

/* Responsive border radius adjustments */
@media (min-width: 768px) {
  .fantasy-fall-up::before {
    border-bottom-left-radius: var(--fantasy-fall-radius-md);
    border-bottom-right-radius: var(--fantasy-fall-radius-md);
  }

  .fantasy-fall-down::before {
    border-top-left-radius: var(--fantasy-fall-radius-md);
    border-top-right-radius: var(--fantasy-fall-radius-md);
  }

  .fantasy-fall-left::before {
    border-top-right-radius: var(--fantasy-fall-radius-md);
    border-bottom-right-radius: var(--fantasy-fall-radius-md);
  }

  .fantasy-fall-right::before {
    border-top-left-radius: var(--fantasy-fall-radius-md);
    border-bottom-left-radius: var(--fantasy-fall-radius-md);
  }
}

@media (min-width: 1024px) {
  .fantasy-fall-up::before {
    border-bottom-left-radius: var(--fantasy-fall-radius-lg);
    border-bottom-right-radius: var(--fantasy-fall-radius-lg);
  }

  .fantasy-fall-down::before {
    border-top-left-radius: var(--fantasy-fall-radius-lg);
    border-top-right-radius: var(--fantasy-fall-radius-lg);
  }

  .fantasy-fall-left::before {
    border-top-right-radius: var(--fantasy-fall-radius-lg);
    border-bottom-right-radius: var(--fantasy-fall-radius-lg);
  }

  .fantasy-fall-right::before {
    border-top-left-radius: var(--fantasy-fall-radius-lg);
    border-bottom-left-radius: var(--fantasy-fall-radius-lg);
  }
}
</style>

<style>
/* Top direction animation */
@keyframes fantasy-fall-up {
  0% {
    transform: translateY(-100%);
  }

  50% {
    transform: translateY(0%);
  }

  100% {
    transform: translateY(0%);
    border-bottom-right-radius: 0%;
    border-bottom-left-radius: 0%;
  }
}

/* Bottom direction animation */
@keyframes fantasy-fall-down {
  0% {
    transform: translateY(100%);
  }

  50% {
    transform: translateY(0%);
  }

  100% {
    transform: translateY(0%);
    border-top-right-radius: 0%;
    border-top-left-radius: 0%;
  }
}

/* Left direction animation */
@keyframes fantasy-fall-left {
  0% {
    transform: translateX(-100%);
  }

  50% {
    transform: translateX(0%);
  }

  100% {
    transform: translateX(0%);
    border-top-right-radius: 0%;
    border-bottom-right-radius: 0%;
  }
}

/* Right direction animation */
@keyframes fantasy-fall-right {
  0% {
    transform: translateX(100%);
  }

  50% {
    transform: translateX(0%);
  }

  100% {
    transform: translateX(0%);
    border-top-left-radius: 0%;
    border-bottom-left-radius: 0%;
  }
}
</style>
